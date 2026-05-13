-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS
-- Managed by the SaaS owner only. Never written to by the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT        NOT NULL UNIQUE,
    tenant_code TEXT        NOT NULL UNIQUE
                            CHECK (tenant_code ~ '^[a-z0-9]+$'),
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SAAS TIERS
-- Billing tiers for tenants (renamed from tenant_plans to avoid
-- confusion with the per-tenant customer subscription plans).
-- Managed by the SaaS owner only. Never written to by the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS saas_tiers (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT        NOT NULL,
    max_users     INT         NOT NULL CHECK (max_users > 0),
    max_customers INT         NOT NULL CHECK (max_customers > 0),
    price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    grace_days    INT         NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
    tenant_id     UUID        NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_saas_tiers_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

-- ============================================================
-- USERS
-- App-level user records. id mirrors auth.users.id.
-- Each tenant has exactly one superadmin (enforced by uq_users_superadmin_per_tenant).
-- Only active users can log in.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY,
    username     TEXT        NOT NULL,
    full_name    TEXT        NOT NULL,
    phone_number TEXT,
    role         TEXT        NOT NULL DEFAULT 'user'
                             CHECK (role IN ('superadmin', 'admin', 'user')),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    tenant_id    UUID        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_tenant
    ON users (username, tenant_id);

-- Enforces one superadmin per tenant at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_superadmin_per_tenant
    ON users (tenant_id)
    WHERE role = 'superadmin';

CREATE INDEX IF NOT EXISTS idx_users_tenant_id
    ON users (tenant_id);

-- ============================================================
-- PLANS
-- Customer subscription packages defined per tenant.
-- NOT the same as saas_tiers (SaaS billing) — completely separate concept.
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT          NOT NULL,
    price           NUMERIC(12,2) CHECK (price IS NULL OR price > 0),
    is_custom_price BOOLEAN       NOT NULL DEFAULT FALSE,
    tenant_id       UUID          NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- A fixed plan must have a price; a custom-price plan must not.
    CONSTRAINT chk_plan_price_consistency
        CHECK (
            (is_custom_price = FALSE AND price IS NOT NULL)
            OR
            (is_custom_price = TRUE AND price IS NULL)
        ),

    CONSTRAINT fk_plans_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_name_tenant
    ON plans (name, tenant_id);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_id
    ON plans (tenant_id);

-- ============================================================
-- CUSTOMERS
-- Soft-delete only. Hard deletes are NEVER performed.
-- cancelled_at records when a customer was deactivated.
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    phone_number TEXT,
    address      TEXT,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    plan_id      UUID,
    tenant_id    UUID        NOT NULL,
    start_date   DATE        NOT NULL,
    cancelled_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- cancelled_at must be set when and only when active = false
    CONSTRAINT chk_customer_cancelled_consistency
        CHECK (
            (active = TRUE  AND cancelled_at IS NULL)
            OR
            (active = FALSE AND cancelled_at IS NOT NULL)
        ),

    CONSTRAINT fk_customers_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_customers_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
    ON customers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_plan_id
    ON customers (plan_id);

CREATE INDEX IF NOT EXISTS idx_customers_active
    ON customers (tenant_id, active);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PAYMENTS
-- Append-only audit log. Hard deletes are NEVER performed.
-- Corrections are made by voiding (voided_at) then re-inserting.
-- amount is a SNAPSHOT — never recomputed from plan.price.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
    id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Always the first day of the month (YYYY-MM-01). Enforced by constraint.
    billing_month       DATE          NOT NULL,

    -- Snapshot of the amount at time of payment. Never changes after insert.
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),

    customer_id         UUID          NOT NULL,
    plan_id             UUID,
    received_by_user_id UUID,
    tenant_id           UUID          NOT NULL,

    paid_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- Soft void fields. Set together or not at all.
    voided_at           TIMESTAMPTZ,
    voided_by           UUID,
    notes               TEXT,

    -- Ensure billing_month is always the 1st of the month
    CONSTRAINT chk_billing_month_first_day
        CHECK (EXTRACT(DAY FROM billing_month) = 1),

    -- voided_at and voided_by must be set together
    CONSTRAINT chk_void_consistency
        CHECK (
            (voided_at IS NULL AND voided_by IS NULL)
            OR
            (voided_at IS NOT NULL AND voided_by IS NOT NULL)
        ),

    -- Void requires a reason
    CONSTRAINT chk_void_requires_notes
        CHECK (
            voided_at IS NULL
            OR
            (voided_at IS NOT NULL AND notes IS NOT NULL AND notes <> '')
        ),

    CONSTRAINT fk_payments_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_payments_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_payments_received_by
        FOREIGN KEY (received_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_payments_voided_by
        FOREIGN KEY (voided_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_payments_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    -- One payment record per customer per month (void + re-pay updates the same row)
    CONSTRAINT uq_payments_customer_month
        UNIQUE (customer_id, billing_month)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id
    ON payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id
    ON payments (customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_billing_month
    ON payments (billing_month);

CREATE INDEX IF NOT EXISTS idx_payments_customer_month
    ON payments (customer_id, billing_month);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION
-- Extracts tenant_id from the Supabase JWT.
-- The JWT must include a custom claim: { "tenant_id": "<uuid>" }
-- Set this up in Supabase Dashboard → Auth → Hooks, or via
-- a custom access token hook that reads from public.users.
-- ============================================================

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
    SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================
-- CUSTOM ACCESS TOKEN HOOK
-- Injects tenant_id into the JWT so RLS can use current_tenant_id().
-- After creating this function, enable it in:
-- Dashboard → Authentication → Hooks → "Customize access token (JWT) claims"
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  user_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO user_tenant_id
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF user_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- RLS POLICIES
-- ============================================================

DO $$ BEGIN

    -- ── TENANTS ──────────────────────────────────────────────
    -- App users can only read their own tenant row.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenants' AND policyname = 'tenants_select'
    ) THEN
        CREATE POLICY tenants_select ON tenants
            FOR SELECT USING (id = current_tenant_id());
    END IF;

    -- ── SAAS TIERS ───────────────────────────────────────────
    -- App users can read their own tier (e.g. to display grace_days).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'saas_tiers' AND policyname = 'saas_tiers_select'
    ) THEN
        CREATE POLICY saas_tiers_select ON saas_tiers
            FOR SELECT USING (tenant_id = current_tenant_id());
    END IF;

    -- ── USERS ────────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_select'
    ) THEN
        CREATE POLICY users_select ON users
            FOR SELECT USING (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_insert'
    ) THEN
        CREATE POLICY users_insert ON users
            FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_update'
    ) THEN
        CREATE POLICY users_update ON users
            FOR UPDATE USING (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- ── PLANS ────────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'plans' AND policyname = 'plans_all'
    ) THEN
        CREATE POLICY plans_all ON plans
            FOR ALL
            USING     (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- ── CUSTOMERS ────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'customers' AND policyname = 'customers_all'
    ) THEN
        CREATE POLICY customers_all ON customers
            FOR ALL
            USING     (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- ── PAYMENTS ─────────────────────────────────────────────
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'payments' AND policyname = 'payments_all'
    ) THEN
        CREATE POLICY payments_all ON payments
            FOR ALL
            USING     (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

END $$;

-- ============================================================
-- SETUP NOTES (READ BEFORE DEPLOYING)
-- ============================================================

-- 1. JWT CLAIM SETUP (REQUIRED)
--    The current_tenant_id() function reads 'tenant_id' from the JWT.
--    You must add this claim via a Supabase Auth Hook:
--    Dashboard → Authentication → Hooks → "Customize access token (JWT) claims"
--    The hook should look up auth.uid() in public.users and return tenant_id.
--    Without this, RLS will block all queries silently (returns empty, not error).

-- 2. NAMING (READ)
--    saas_tiers = SaaS billing tiers (you manage this, one row per tenant)
--    plans      = customer subscription packages (tenant's staff manage this)
--    These are entirely different concepts. Do not confuse them.

-- 3. PAYMENT INTEGRITY
--    billing_month MUST be YYYY-MM-01. The chk_billing_month_first_day constraint
--    enforces this at the DB level. The app must also normalize before inserting.
--    amount is a SNAPSHOT. Never read plan.price to display a payment's value.
--    voided payments are retained forever. uq_payments_customer_month_active
--    only blocks duplicate ACTIVE (non-voided) payments, allowing a re-payment
--    after a void.

-- 4. CUSTOMER DEACTIVATION
--    Never DELETE a customer. Set active = false and cancelled_at = NOW().
--    The chk_customer_cancelled_consistency constraint enforces both fields
--    are set together.

-- 5. RLS IS THE PRIMARY TENANT GUARD
--    App-level tenant_id filtering is secondary. RLS alone is enough,
--    but the app filters by tenant_id too for defence in depth.
--    Never call supabase.rpc() with SECURITY DEFINER unless you've audited it.
