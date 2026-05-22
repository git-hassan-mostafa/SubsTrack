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
-- CURRENCIES
-- Per-tenant supported non-USD currencies with current rate.
-- USD is the implicit base — never stored as a row.
-- active = false hides the currency from new selections but preserves history.
-- ============================================================

CREATE TABLE IF NOT EXISTS currencies (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID          NOT NULL,
    code          TEXT          NOT NULL,
    name          TEXT          NOT NULL,
    symbol        TEXT,
    rate_per_usd  NUMERIC(20,8) NOT NULL CHECK (rate_per_usd > 0),
    decimals      INTEGER       NOT NULL DEFAULT 2 CHECK (decimals BETWEEN 0 AND 6),
    active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_currency_code_format
        CHECK (code ~ '^[A-Z]{2,8}$' AND code <> 'USD'),

    CONSTRAINT fk_currencies_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_currencies_code_tenant
    ON currencies (tenant_id, code);

CREATE INDEX IF NOT EXISTS idx_currencies_tenant_id
    ON currencies (tenant_id);

-- ============================================================
-- BRANCHES
-- Multi-location support. A tenant can have zero, one, or many branches.
-- Zero branches = single-location tenant (branch_id NULL everywhere).
-- Soft-delete via active = false (records keep their branch_id references).
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        NOT NULL,
    name        TEXT        NOT NULL,
    active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_branches_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_name_tenant
    ON branches (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id
    ON branches (tenant_id);

-- ============================================================
-- USERS
-- App-level user records. id mirrors auth.users.id.
-- Each tenant has exactly one superadmin (enforced by uq_users_superadmin_per_tenant).
-- Only active users can log in.
-- Display currency preference is stored client-side in AsyncStorage (no DB column).
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
    -- Branch assignment. NULL = tenant-wide admin (sees all branches).
    -- App-level rule (UserService.validate): role = 'user' requires a branch
    -- once the tenant has >= 1 branch. Not enforced by DB CHECK because it
    -- depends on a count from another table.
    branch_id    UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_users_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL
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
    price           NUMERIC(20,8) CHECK (price IS NULL OR price > 0),
    is_custom_price BOOLEAN       NOT NULL DEFAULT FALSE,
    -- Number of months this plan covers per payment (1 = monthly, 3 = quarterly, etc.)
    -- Multi-month plans must have a fixed bundle price (is_custom_price must be FALSE).
    duration_months INTEGER       NOT NULL DEFAULT 1 CHECK (duration_months >= 1),
    -- Currency of the stored price. NULL = USD (the base currency).
    -- ON DELETE RESTRICT: cannot drop a currency referenced by a plan.
    currency_id     UUID,
    tenant_id       UUID          NOT NULL,
    -- Branch this plan belongs to. NULL = SHARED catalog item (available at every branch).
    -- This is the OPPOSITE semantic of customers.branch_id (where NULL = unassigned/hidden).
    branch_id       UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- A fixed plan must have a price; a custom-price plan must not.
    CONSTRAINT chk_plan_price_consistency
        CHECK (
            (is_custom_price = FALSE AND price IS NOT NULL)
            OR
            (is_custom_price = TRUE AND price IS NULL)
        ),

    -- Multi-month plans cannot have custom pricing (bundle price must be fixed).
    CONSTRAINT chk_multi_month_requires_fixed_price
        CHECK (duration_months = 1 OR is_custom_price = FALSE),

    CONSTRAINT fk_plans_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_plans_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_plans_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL
);

-- Uniqueness allows the same plan name across branches (NULLs compare unequal in PG unique).
-- Example: "Basic" shared (branch_id NULL) AND "Basic" Beirut (branch_id X) coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_name_tenant_branch
    ON plans (tenant_id, branch_id, name);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_id
    ON plans (tenant_id);

CREATE INDEX IF NOT EXISTS idx_plans_branch_id
    ON plans (branch_id);

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
    area         TEXT,
    notes        TEXT,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    is_regular   BOOLEAN     NOT NULL DEFAULT TRUE,
    plan_id      UUID,
    tenant_id    UUID        NOT NULL,
    -- Branch this customer belongs to. NULL = UNASSIGNED — visible ONLY to
    -- tenant-wide admins (users with users.branch_id IS NULL). Branch-scoped
    -- users do not see unassigned customers.
    branch_id    UUID,
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
        ON DELETE SET NULL,

    CONSTRAINT fk_customers_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
    ON customers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_plan_id
    ON customers (plan_id);

CREATE INDEX IF NOT EXISTS idx_customers_active
    ON customers (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_customers_branch_id
    ON customers (branch_id);

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

CREATE OR REPLACE TRIGGER trg_currencies_updated_at
    BEFORE UPDATE ON currencies
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON branches
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

    -- Snapshot of what was owed at time of recording. Never changes after insert.
    -- Stored in the CURRENCY indicated by currency_id (NULL = USD).
    amount_due          NUMERIC(20,8) NOT NULL CHECK (amount_due > 0),

    -- What was actually collected. Can be less than amount_due (partial payment).
    -- 0 is allowed (reserves the slot but treated as unpaid in the grid).
    -- Same currency as amount_due.
    amount_paid         NUMERIC(20,8) NOT NULL CHECK (amount_paid >= 0 AND amount_paid <= amount_due),

    -- Computed balance. Read-only — never written by the app.
    balance             NUMERIC(20,8) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,

    -- Number of consecutive months this payment covers (1 = single month, 3 = Jan+Feb+Mar, etc.)
    -- billing_month is always the FIRST month of the block.
    duration_months     INTEGER       NOT NULL DEFAULT 1 CHECK (duration_months >= 1),

    -- Currency the amounts above are stored in. NULL = USD.
    -- ON DELETE RESTRICT: cannot drop a currency referenced by a payment.
    currency_id         UUID,

    -- Exchange rate (units of currency_id per 1 USD) captured at recording time.
    -- For USD payments (currency_id IS NULL), this is always 1.
    -- Frozen snapshot so historical USD-equivalent values never drift when currencies.rate_per_usd is edited.
    rate_per_usd_snapshot NUMERIC(20,8) NOT NULL CHECK (rate_per_usd_snapshot > 0),

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

    CONSTRAINT fk_payments_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT,

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

ALTER TABLE tenants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches   ENABLE ROW LEVEL SECURITY;
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
-- HELPER FUNCTION
-- Returns the calling user's branch_id, or NULL if they are a
-- tenant-wide admin (branch_id IS NULL in public.users).
-- Used by branch-aware RLS policies.
-- ============================================================

CREATE OR REPLACE FUNCTION current_branch_id()
RETURNS UUID AS $$
    SELECT branch_id FROM public.users WHERE id = auth.uid();
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

-- Drop the old non-branch-aware policies before recreating them.
-- These were tenant-only — branch awareness is layered in below.
DROP POLICY IF EXISTS customers_all ON customers;
DROP POLICY IF EXISTS plans_all     ON plans;
DROP POLICY IF EXISTS payments_all  ON payments;
DROP POLICY IF EXISTS users_select  ON users;
DROP POLICY IF EXISTS users_insert  ON users;
DROP POLICY IF EXISTS users_update  ON users;

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

    -- ── CURRENCIES ───────────────────────────────────────────
    -- Tenant-wide; not branch-scoped.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'currencies' AND policyname = 'currencies_all'
    ) THEN
        CREATE POLICY currencies_all ON currencies
            FOR ALL
            USING     (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- ── BRANCHES ─────────────────────────────────────────────
    -- All tenant members can SELECT branches (the list is needed to render
    -- assignment dropdowns even for branch-scoped users). Mutation is
    -- restricted at the app layer (admin-only).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'branches' AND policyname = 'branches_all'
    ) THEN
        CREATE POLICY branches_all ON branches
            FOR ALL
            USING     (tenant_id = current_tenant_id())
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- ── USERS ────────────────────────────────────────────────
    -- Branch-aware:
    --   tenant-wide user (current_branch_id() IS NULL) sees ALL users in tenant
    --   branch-scoped user sees ONLY users in their own branch (incl. self)
    --   Unassigned users (branch_id IS NULL) are visible ONLY to tenant-wide.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_select'
    ) THEN
        CREATE POLICY users_select ON users
            FOR SELECT USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_insert'
    ) THEN
        CREATE POLICY users_insert ON users
            FOR INSERT WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'users' AND policyname = 'users_update'
    ) THEN
        CREATE POLICY users_update ON users
            FOR UPDATE
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- ── PLANS ────────────────────────────────────────────────
    -- Plans use SHARED-CATALOG semantics: branch_id IS NULL means
    -- "available to every branch" (visible to everyone). Branch-scoped
    -- users see shared plans + their own branch plans.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'plans' AND policyname = 'plans_select'
    ) THEN
        CREATE POLICY plans_select ON plans
            FOR SELECT USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- Branch-scoped admins can only create/modify plans for their own branch
    -- (cannot create shared plans). Tenant-wide admins can do either.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'plans' AND policyname = 'plans_modify'
    ) THEN
        CREATE POLICY plans_modify ON plans
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- ── CUSTOMERS ────────────────────────────────────────────
    -- Strict isolation: branch_id IS NULL is UNASSIGNED — visible only
    -- to tenant-wide admins. Branch-scoped users never see unassigned.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'customers' AND policyname = 'customers_all'
    ) THEN
        CREATE POLICY customers_all ON customers
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- ── PAYMENTS ─────────────────────────────────────────────
    -- Payments don't have their own branch_id; they inherit from the
    -- customer. Tenant-wide users see all; branch-scoped see only
    -- payments whose customer.branch_id matches theirs.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'payments' AND policyname = 'payments_all'
    ) THEN
        CREATE POLICY payments_all ON payments
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = payments.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = payments.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                )
            );
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
--    amount_due and amount_paid are SNAPSHOTS. Never recompute from plan.price.
--    amount_paid < amount_due = partial payment; balance holds the outstanding debt.
--    amount_paid = 0 is treated as unpaid in the app (reserves the row slot).
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

-- 6. BRANCHES (multi-location support)
--    Branches live INSIDE a tenant. Tenant isolation stays in current_tenant_id();
--    branch isolation layers on top via current_branch_id().
--
--    users.branch_id       NULL = tenant-wide admin (sees all branches + unassigned)
--                          NOT NULL = scoped to that branch only
--    customers.branch_id   NULL = UNASSIGNED (visible only to tenant-wide admins)
--                          NOT NULL = belongs to that branch (visible to that branch's staff)
--    plans.branch_id       NULL = SHARED (visible to everyone in the tenant)
--                          NOT NULL = branch-specific (only that branch sees it)
--    payments              No branch_id; inherits from customers.branch_id via JOIN.
--
--    Single-branch tenants leave branch_id NULL on every row — the feature is invisible.
--    Branch-scoped admins cannot create shared plans (WITH CHECK enforces branch match).
