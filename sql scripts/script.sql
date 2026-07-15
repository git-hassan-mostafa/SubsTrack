-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TIER PLANS
-- Global subscription tier catalog (Free, Pro, Business).
-- A fixed, small set of rows shared across all tenants — each
-- tenant.tier_id points at one. Managed by the SaaS owner via
-- SuperAdmin (service role). Mobile app reads via RLS; signup
-- screen reads as anon to display pricing.
-- NULL on any *max_ column means "unlimited".
-- ============================================================

CREATE TABLE IF NOT EXISTS tier_plans (
    id                        UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    code                      TEXT          NOT NULL UNIQUE
                                            CHECK (code IN ('free', 'pro', 'business')),
    name                      TEXT          NOT NULL,
    sort_order                INT           NOT NULL,

    -- Numeric limits (NULL = unlimited)
    max_customers             INT           CHECK (max_customers IS NULL OR max_customers >= 0),
    max_users                 INT           CHECK (max_users     IS NULL OR max_users     >= 0),
    max_plans                 INT           CHECK (max_plans     IS NULL OR max_plans     >= 0),
    max_branches              INT           CHECK (max_branches  IS NULL OR max_branches  >= 0),
    max_currencies            INT           CHECK (max_currencies IS NULL OR max_currencies >= 0),
    max_products              INT           CHECK (max_products  IS NULL OR max_products  >= 0),

    -- Feature flags
    multi_currency_enabled    BOOLEAN       NOT NULL DEFAULT FALSE,
    multi_month_plans_enabled BOOLEAN       NOT NULL DEFAULT FALSE,

    -- Operational
    grace_days                INT           NOT NULL DEFAULT 0 CHECK (grace_days >= 0),

    -- Pricing (USD). Stripe price IDs can be added later as nullable columns.
    price_monthly_usd         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_monthly_usd >= 0),
    price_yearly_usd          NUMERIC(10,2)             CHECK (price_yearly_usd IS NULL OR price_yearly_usd >= 0),

    active                    BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Seed the three tiers. Idempotent via ON CONFLICT — re-runs of the script
-- preserve any limit/price tweaks made later via SuperAdmin.
INSERT INTO tier_plans (
    code, name, sort_order,
    max_customers, max_users, max_plans, max_branches, max_currencies, max_products,
    multi_currency_enabled, multi_month_plans_enabled,
    grace_days, price_monthly_usd
) VALUES
    ('free',     'Free',     0,   30,   1,    3,    1,    0,    5, FALSE, FALSE, 0,  0),
    ('pro',      'Pro',      1,  300,   5, NULL,    3, NULL, NULL, TRUE,  TRUE,  3,  9),
    ('business', 'Business', 2, NULL, NULL, NULL, NULL, NULL, NULL, TRUE,  TRUE,  7, 29)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- APP OPTIONS
-- Global key/value config shared across ALL tenants (NOT tenant-scoped).
-- Managed by the SaaS owner via the SuperAdmin "Options" page (service role).
-- The SubsTrack mobile app reads these via RLS (authenticated SELECT only);
-- it never writes. Example: 'LiraRate' = default USD→LBP rate seeded onto
-- each new tenant's auto-created Lebanese Pound (LBP) currency at signup.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_options (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    key         TEXT        NOT NULL UNIQUE,
    value       TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default global options. Idempotent via ON CONFLICT — re-runs of the
-- script preserve any value edited later via SuperAdmin. 'LiraRate' is the
-- default USD→LBP exchange rate (units of LBP per 1 USD) applied to each new
-- tenant's auto-created LBP currency.
INSERT INTO app_options (key, value, description) VALUES
    ('LiraRate', '89000', 'Default USD→LBP exchange rate (LBP per 1 USD) seeded onto each new tenant''s Lebanese Pound currency.'),
    ('AllowPlanUpgrade', 'true', 'When ''false'', tenants cannot self-upgrade in-app; the upgrade button is replaced by a WhatsApp "contact to upgrade" button (uses SupportWhatsAppNumber).'),
    ('AllowSelfServiceSignup', 'true', 'When ''false'', the login screen hides the "Create workspace" button and the create-tenant Edge Function rejects new signups.'),
    ('SupportWhatsAppNumber', '', 'Support WhatsApp number in international format (digits only, e.g. 9613123456). Used by the "contact to upgrade" button when AllowPlanUpgrade is false.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- TENANTS
-- Managed by the SaaS owner via the SuperAdmin app (service role)
-- and by new users via the public `create-tenant` Edge Function
-- (service role, server-side). The SubsTrack mobile app never
-- writes to this table with the anon key.
-- ============================================================

CREATE OR REPLACE FUNCTION get_free_tier_id()
RETURNS UUID
LANGUAGE SQL
AS $$
    SELECT id
    FROM tier_plans
    WHERE code = 'free'
$$;

CREATE TABLE IF NOT EXISTS tenants (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT        NOT NULL UNIQUE,
    tenant_code      TEXT        NOT NULL UNIQUE
                                 CHECK (tenant_code ~ '^[a-z0-9]+$'),
    active           BOOLEAN     NOT NULL DEFAULT TRUE,
    -- Subscription tier. Defaults to Free; SuperAdmin or in-app upgrade flow
    -- swaps it. ON DELETE RESTRICT — never lose tier association silently.
    tier_id          UUID        NOT NULL
                                 DEFAULT get_free_tier_id(),
    tier_upgraded_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_tenants_tier
        FOREIGN KEY (tier_id)
        REFERENCES tier_plans(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tenants_tier_id
    ON tenants (tier_id);

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
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
-- NOT the same as tier_plans (SaaS subscription tiers) — completely separate concept.
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
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

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
    -- Optional Google Maps share link pasted by staff. Stored raw (not parsed
    -- into coordinates) — the collector re-opens it to get directions.
    location_url TEXT,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    is_regular   BOOLEAN     NOT NULL DEFAULT TRUE,
    -- NOTE: a customer's plan(s) now live in the customer_plans table (one row
    -- per service line). customers.plan_id was removed — see customer_plans below.
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

    CONSTRAINT fk_customers_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id
    ON customers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customers_active
    ON customers (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_customers_branch_id
    ON customers (branch_id);

-- ============================================================
-- CUSTOMER PLANS (service lines)
-- One row per plan a customer is subscribed to. A customer can hold
-- several lines (e.g. an ISP customer with internet + IPTV), each paid
-- independently. Each line owns its own start_date / cancelled_at so
-- services can begin and end on different dates. plan_id may be NULL for
-- a custom / occasional line (ad-hoc amounts, no fixed plan).
-- Soft-delete only via active = false + cancelled_at.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_plans (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id  UUID        NOT NULL,
    -- The plan this line is on. NULL = custom/occasional (ad-hoc amounts).
    -- ON DELETE SET NULL: dropping a plan leaves the line plan-less, history intact.
    plan_id      UUID,
    start_date   DATE        NOT NULL,
    cancelled_at TIMESTAMPTZ,
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    tenant_id    UUID        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- cancelled_at must be set when and only when active = false
    CONSTRAINT chk_customer_plan_cancelled_consistency
        CHECK (
            (active = TRUE  AND cancelled_at IS NULL)
            OR
            (active = FALSE AND cancelled_at IS NOT NULL)
        ),

    CONSTRAINT fk_customer_plans_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_customer_plans_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_customer_plans_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_plans_customer_id
    ON customer_plans (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_plans_tenant_id
    ON customer_plans (tenant_id);

CREATE INDEX IF NOT EXISTS idx_customer_plans_plan_id
    ON customer_plans (plan_id);

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

CREATE OR REPLACE TRIGGER trg_customer_plans_updated_at
    BEFORE UPDATE ON customer_plans
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

CREATE OR REPLACE TRIGGER trg_app_options_updated_at
    BEFORE UPDATE ON app_options
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Server-authoritative updated_at on the remaining synced tables. Drives the
-- offline client's incremental pull (WHERE updated_at > cursor) and is immune to
-- client clock skew — see docs/offline.md.
CREATE OR REPLACE TRIGGER trg_tier_plans_updated_at
    BEFORE UPDATE ON tier_plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- payments + sales updated_at triggers are defined at the end of this file,
-- after those tables exist.

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
    -- The service line (customer_plans row) this payment settles. A customer can
    -- hold several lines, each paid independently — uniqueness is per line+month.
    customer_plan_id    UUID          NOT NULL,
    -- Snapshot of which plan/price applied at recording time. NULL = custom/no plan.
    plan_id             UUID,
    received_by_user_id UUID,
    tenant_id           UUID          NOT NULL,

    paid_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- Soft void fields. Set together or not at all.
    voided_at           TIMESTAMPTZ,
    voided_by           UUID,
    notes               TEXT,

    -- Collector wallet: when the cash collected here was handed over to an admin.
    -- NULL = still in the collector's (received_by_user_id) wallet, not yet
    -- handed over. Set together (see chk_payments_remitted_consistency). A void +
    -- re-pay resets these to NULL — the re-recorded cash is unremitted again.
    remitted_at         TIMESTAMPTZ,
    remitted_by         UUID,

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

    -- remitted_at and remitted_by must be set together
    CONSTRAINT chk_payments_remitted_consistency
        CHECK (
            (remitted_at IS NULL AND remitted_by IS NULL)
            OR
            (remitted_at IS NOT NULL AND remitted_by IS NOT NULL)
        ),

    CONSTRAINT fk_payments_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_payments_customer_plan
        FOREIGN KEY (customer_plan_id)
        REFERENCES customer_plans(id)
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

    CONSTRAINT fk_payments_remitted_by
        FOREIGN KEY (remitted_by)
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

    -- One payment record per service line per month (void + re-pay updates the
    -- same row). A customer with several lines can pay each one for the same month.
    CONSTRAINT uq_payments_line_month
        UNIQUE (customer_plan_id, billing_month)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id
    ON payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id
    ON payments (customer_id);

CREATE INDEX IF NOT EXISTS idx_payments_billing_month
    ON payments (billing_month);

CREATE INDEX IF NOT EXISTS idx_payments_customer_month
    ON payments (customer_id, billing_month);

CREATE INDEX IF NOT EXISTS idx_payments_customer_plan_id
    ON payments (customer_plan_id);

-- Collector wallet: fast lookup of cash still held by a collector (not remitted,
-- not voided). Partial index keeps it tiny once most cash is handed over.
CREATE INDEX IF NOT EXISTS idx_payments_wallet
    ON payments (received_by_user_id)
    WHERE remitted_at IS NULL AND voided_at IS NULL;

-- ============================================================
-- PRODUCTS
-- One-off sellable items (routers, supplements, installation fees…).
-- Distinct from `plans` (recurring subscriptions). Soft-delete via
-- active = false — preserves sale history when a product is retired.
-- Branch semantics mirror plans: branch_id IS NULL = SHARED catalog item.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID          NOT NULL,
    -- NULL = SHARED (visible to every branch). NOT NULL = scoped to one branch.
    branch_id   UUID,
    name        TEXT          NOT NULL,
    description TEXT,
    price       NUMERIC(20,8) NOT NULL CHECK (price > 0),
    -- Currency the price is stored in. NULL = USD (the base).
    currency_id UUID,
    active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_products_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_products_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_products_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT
);

-- Same-name uniqueness rules as plans: shared + branch-specific can coexist
-- because NULLs compare unequal in a Postgres unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_name_tenant_branch
    ON products (tenant_id, branch_id, name);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id
    ON products (tenant_id);

CREATE INDEX IF NOT EXISTS idx_products_branch_id
    ON products (branch_id);

CREATE OR REPLACE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SALES
-- Ledger of one-off product sales. Customer is OPTIONAL (walk-in supported).
-- Mirrors the snapshot principle from payments: unit_amount,
-- product_name_snapshot, and rate_per_usd_snapshot are frozen at write
-- time and never recomputed. Soft-void only — historical totals stay accurate.
-- No UNIQUE constraint on (customer, product, day) — the same customer can
-- buy the same product twice in a day legitimately.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
    id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID          NOT NULL,
    -- Branch where the sale was recorded. Inherited from the recording user
    -- (or chosen by tenant-wide admins). NULL = sold by a tenant-wide admin
    -- with no branch context (rare but legal).
    branch_id             UUID,
    product_id            UUID          NOT NULL,
    -- Snapshot of product.name at sale time. Survives product renames or
    -- soft-deletes (active = false) so receipts always show what was sold.
    product_name_snapshot TEXT          NOT NULL,
    -- NULL = walk-in / anonymous sale.
    customer_id           UUID,
    recorded_by_user_id   UUID,
    quantity              INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    -- Per-unit price at sale time. May differ from product.price (staff
    -- gave a discount, rounded, etc.). Snapshot — never recomputed.
    unit_amount           NUMERIC(20,8) NOT NULL CHECK (unit_amount > 0),
    -- Read-only computed total. App never writes this.
    total_amount          NUMERIC(20,8) GENERATED ALWAYS AS (unit_amount * quantity) STORED,
    -- How much of the sale was actually collected at sale time. Same currency as
    -- unit_amount. A partial sale (amount_paid < total) leaves a "Sales" debt.
    -- Legacy sales predating this column backfill to full (see migration).
    amount_paid           NUMERIC(20,8) NOT NULL DEFAULT 0,
    -- Currency the amounts above are stored in. NULL = USD.
    currency_id           UUID,
    -- Exchange rate (units of currency_id per 1 USD) frozen at recording time.
    -- USD sales (currency_id IS NULL) always store 1. Mirrors payments.rate_per_usd_snapshot.
    rate_per_usd_snapshot NUMERIC(20,8) NOT NULL CHECK (rate_per_usd_snapshot > 0),
    sold_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Soft-void fields. Set together or not at all. Reason required when set.
    voided_at             TIMESTAMPTZ,
    voided_by             UUID,
    void_reason           TEXT,
    notes                 TEXT,

    -- Collector wallet: when the cash collected here (amount_paid) was handed
    -- over to an admin. NULL = still in the recording user's wallet. Set together.
    remitted_at           TIMESTAMPTZ,
    remitted_by           UUID,

    -- amount_paid can't be negative and can't exceed the sale total. Uses the
    -- BASE columns (unit_amount * quantity) — Postgres forbids referencing the
    -- GENERATED total_amount column inside a CHECK.
    CONSTRAINT chk_sales_amount_paid
        CHECK (amount_paid >= 0 AND amount_paid <= unit_amount * quantity),

    -- remitted_at and remitted_by must be set together
    CONSTRAINT chk_sales_remitted_consistency
        CHECK (
            (remitted_at IS NULL AND remitted_by IS NULL)
            OR
            (remitted_at IS NOT NULL AND remitted_by IS NOT NULL)
        ),

    CONSTRAINT fk_sales_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sales_branch
        FOREIGN KEY (branch_id)
        REFERENCES branches(id)
        ON DELETE SET NULL,

    -- Products referenced by sales cannot be hard-deleted. Use active = false.
    CONSTRAINT fk_sales_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT,

    -- Customer can be removed without orphaning the sale.
    CONSTRAINT fk_sales_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_sales_recorded_by
        FOREIGN KEY (recorded_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_sales_voided_by
        FOREIGN KEY (voided_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_sales_remitted_by
        FOREIGN KEY (remitted_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_sales_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_sold_at
    ON sales (tenant_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_customer
    ON sales (customer_id)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_branch
    ON sales (branch_id);

CREATE INDEX IF NOT EXISTS idx_sales_product
    ON sales (product_id);

-- Collector wallet: cash still held by a recording user (not remitted, not voided).
CREATE INDEX IF NOT EXISTS idx_sales_wallet
    ON sales (recorded_by_user_id)
    WHERE remitted_at IS NULL AND voided_at IS NULL;

-- ============================================================
-- CUSTOM DEBTS
-- Hand-typed debts a customer owes that have no source transaction
-- (months come from partial payments, sales from partial sales — those are
-- DERIVED at runtime and never stored here). One row = one custom debt.
-- No branch_id: branch is inherited via the customer, exactly like payments.
-- Soft-void only (voided_at/voided_by/void_reason) — history is kept.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_debts (
    id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID          NOT NULL,
    customer_id           UUID          NOT NULL,
    -- What the debt is for. Free text shown as the row label.
    description           TEXT,
    amount                NUMERIC(20,8) NOT NULL CHECK (amount > 0),
    -- Currency the amount is stored in. NULL = USD.
    currency_id           UUID,
    -- Exchange rate (units of currency_id per 1 USD) frozen at recording time.
    -- USD debts (currency_id IS NULL) always store 1. Same drift-free principle
    -- as payments/sales.rate_per_usd_snapshot.
    rate_per_usd_snapshot NUMERIC(20,8) NOT NULL CHECK (rate_per_usd_snapshot > 0),
    recorded_by_user_id   UUID,
    incurred_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Soft-void fields. Set together or not at all.
    voided_at             TIMESTAMPTZ,
    voided_by             UUID,
    void_reason           TEXT,
    notes                 TEXT,

    CONSTRAINT chk_custom_debts_void_consistency
        CHECK (
            (voided_at IS NULL AND voided_by IS NULL)
            OR
            (voided_at IS NOT NULL AND voided_by IS NOT NULL)
        ),

    CONSTRAINT fk_custom_debts_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_custom_debts_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_custom_debts_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_custom_debts_recorded_by
        FOREIGN KEY (recorded_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_custom_debts_voided_by
        FOREIGN KEY (voided_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_debts_tenant_id
    ON custom_debts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_custom_debts_customer_id
    ON custom_debts (customer_id);

-- ============================================================
-- DEBT PAYMENTS
-- Money a customer paid AGAINST their total debt. Tied ONLY to the customer —
-- NOT to any specific payment/sale/custom_debt. It never changes an underlying
-- row; a customer's net debt is computed at runtime:
--   net = SUM(category debts) - SUM(debt payments)
-- No branch_id: inherited via the customer. Soft-void only.
-- ============================================================

CREATE TABLE IF NOT EXISTS debt_payments (
    id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id             UUID          NOT NULL,
    customer_id           UUID          NOT NULL,
    amount                NUMERIC(20,8) NOT NULL CHECK (amount > 0),
    -- Currency the amount is stored in. NULL = USD.
    currency_id           UUID,
    -- Frozen exchange rate at recording time (units per 1 USD; 1 for USD).
    rate_per_usd_snapshot NUMERIC(20,8) NOT NULL CHECK (rate_per_usd_snapshot > 0),
    received_by_user_id   UUID,
    paid_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Soft-void fields. Set together or not at all.
    voided_at             TIMESTAMPTZ,
    voided_by             UUID,
    void_reason           TEXT,
    notes                 TEXT,

    -- Collector wallet: when this collected cash was handed over to an admin.
    -- NULL = still in the receiving user's wallet. Set together.
    remitted_at           TIMESTAMPTZ,
    remitted_by           UUID,

    CONSTRAINT chk_debt_payments_void_consistency
        CHECK (
            (voided_at IS NULL AND voided_by IS NULL)
            OR
            (voided_at IS NOT NULL AND voided_by IS NOT NULL)
        ),

    CONSTRAINT chk_debt_payments_remitted_consistency
        CHECK (
            (remitted_at IS NULL AND remitted_by IS NULL)
            OR
            (remitted_at IS NOT NULL AND remitted_by IS NOT NULL)
        ),

    CONSTRAINT fk_debt_payments_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_debt_payments_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_debt_payments_currency
        FOREIGN KEY (currency_id)
        REFERENCES currencies(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_debt_payments_received_by
        FOREIGN KEY (received_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_debt_payments_voided_by
        FOREIGN KEY (voided_by)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_debt_payments_remitted_by
        FOREIGN KEY (remitted_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_tenant_id
    ON debt_payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_debt_payments_customer_id
    ON debt_payments (customer_id);

-- Collector wallet: cash still held by a receiving user (not remitted, not voided).
CREATE INDEX IF NOT EXISTS idx_debt_payments_wallet
    ON debt_payments (received_by_user_id)
    WHERE remitted_at IS NULL AND voided_at IS NULL;

-- ============================================================
-- EXCEPTION LOGS
-- Local-first crash/error log written by the native app's global error
-- logger (React ErrorBoundary, RN ErrorUtils global handler, repository
-- catch blocks). Synced PUSH-ONLY from client to server — the server copy
-- is a centralized read sink for developers and is never pulled back down
-- into any device's local SQLite mirror (see docs/offline.md).
-- ============================================================

CREATE TABLE IF NOT EXISTS exception_logs (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Nullable: an error can occur before a tenant/user is established (e.g. login screen).
    tenant_id     UUID,
    user_id       UUID,
    -- Snapshot so the log stays readable if the user row is later deleted.
    username      TEXT,
    -- Where the error was caught: 'boundary' | 'global_handler' | 'repository' | 'service'.
    source        TEXT          NOT NULL,
    message       TEXT          NOT NULL,
    stack         TEXT,
    -- Free-form extra info (e.g. which repository/table was involved).
    context       TEXT,
    occurred_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_exception_logs_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_exception_logs_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exception_logs_tenant_id
    ON exception_logs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_exception_logs_occurred_at
    ON exception_logs (occurred_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_debts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================
CREATE OR REPLACE FUNCTION get_free_tier_id()
RETURNS UUID
LANGUAGE SQL
AS $$
    SELECT id
    FROM tier_plans
    WHERE code = 'free'
$$;

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
DROP POLICY IF EXISTS customer_plans_all ON customer_plans;
DROP POLICY IF EXISTS plans_all     ON plans;
DROP POLICY IF EXISTS payments_all  ON payments;
DROP POLICY IF EXISTS users_select  ON users;
DROP POLICY IF EXISTS users_insert  ON users;
DROP POLICY IF EXISTS users_update  ON users;

DO $$ BEGIN

    -- ── TENANTS ──────────────────────────────────────────────
    -- App users can read their own tenant row.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenants' AND policyname = 'tenants_select'
    ) THEN
        CREATE POLICY tenants_select ON tenants
            FOR SELECT USING (id = current_tenant_id());
    END IF;

    -- Admins and superadmins can update their own tenant (e.g. tier upgrades).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenants' AND policyname = 'tenants_update'
    ) THEN
        CREATE POLICY tenants_update ON tenants
            FOR UPDATE
            USING (
                id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
            )
            WITH CHECK (id = current_tenant_id());
    END IF;

    -- ── TIER PLANS ───────────────────────────────────────────
    -- Readable by everyone (anon + authenticated) so the signup screen
    -- can display pricing/limits and the in-app Subscription screen can
    -- show the tier comparison. Mutations are denied to all roles via
    -- the absence of any other policy — only service_role bypasses RLS.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tier_plans' AND policyname = 'tier_plans_select'
    ) THEN
        CREATE POLICY tier_plans_select ON tier_plans
            FOR SELECT
            TO anon, authenticated
            USING (TRUE);
    END IF;

    -- ── APP OPTIONS ──────────────────────────────────────────
    -- Global, non-tenant config (e.g. LiraRate, feature flags, support
    -- contact). Readable by everyone (anon + authenticated) because some
    -- flags gate pre-auth UI — e.g. the login screen hides the self-service
    -- "Create workspace" button when AllowSelfServiceSignup = false. No write
    -- policy exists, so only service_role (which bypasses RLS — used by
    -- SuperAdmin and the create-tenant Edge Function) can mutate.
    -- (Drop+create so the role set updates on existing deployments.)
    DROP POLICY IF EXISTS app_options_select ON app_options;
    CREATE POLICY app_options_select ON app_options
        FOR SELECT
        TO anon, authenticated
        USING (TRUE);

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

    -- ── CUSTOMER PLANS (service lines) ───────────────────────
    -- No own branch_id; inherit from the owning customer, exactly like
    -- payments. Tenant-wide users see all; branch-scoped users only see
    -- lines whose customer.branch_id matches theirs.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'customer_plans' AND policyname = 'customer_plans_all'
    ) THEN
        CREATE POLICY customer_plans_all ON customer_plans
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = customer_plans.customer_id
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
                        WHERE c.id = customer_plans.customer_id
                          AND c.branch_id = current_branch_id()
                    )
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

    -- ── PRODUCTS ─────────────────────────────────────────────
    -- Identical semantics to plans: shared catalog (branch_id IS NULL)
    -- visible to everyone in the tenant; branch-specific visible to that
    -- branch + tenant-wide admins. Branch-scoped admins cannot create
    -- shared products (WITH CHECK forces branch match).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'products' AND policyname = 'products_select'
    ) THEN
        CREATE POLICY products_select ON products
            FOR SELECT USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR branch_id IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'products' AND policyname = 'products_modify'
    ) THEN
        CREATE POLICY products_modify ON products
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

    -- ── SALES ────────────────────────────────────────────────
    -- Tenant-wide users see everything. Branch-scoped users only see
    -- sales recorded in their own branch. Walk-in sales (customer_id IS NULL)
    -- are scoped via sales.branch_id, not the customer.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'sales' AND policyname = 'sales_all'
    ) THEN
        CREATE POLICY sales_all ON sales
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

    -- ── CUSTOM DEBTS ─────────────────────────────────────────
    -- No own branch_id; inherit from the owning customer, exactly like
    -- payments. Tenant-wide users see all; branch-scoped users only see
    -- debts whose customer.branch_id matches theirs.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'custom_debts' AND policyname = 'custom_debts_all'
    ) THEN
        CREATE POLICY custom_debts_all ON custom_debts
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = custom_debts.customer_id
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
                        WHERE c.id = custom_debts.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                )
            );
    END IF;

    -- ── DEBT PAYMENTS ────────────────────────────────────────
    -- Same branch-via-customer inheritance as custom_debts / payments.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'debt_payments' AND policyname = 'debt_payments_all'
    ) THEN
        CREATE POLICY debt_payments_all ON debt_payments
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = debt_payments.customer_id
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
                        WHERE c.id = debt_payments.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                )
            );
    END IF;

    -- ── EXCEPTION LOGS ───────────────────────────────────────
    -- Flat debug/audit log, not branch-owned. Tenant-scoped read/write;
    -- rows with a NULL tenant_id (pre-auth errors) are also visible/insertable
    -- since there is no tenant to scope them to.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'exception_logs' AND policyname = 'exception_logs_all'
    ) THEN
        CREATE POLICY exception_logs_all ON exception_logs
            FOR ALL
            USING (tenant_id = current_tenant_id() OR tenant_id IS NULL)
            WITH CHECK (tenant_id = current_tenant_id() OR tenant_id IS NULL);
    END IF;

END $$;

-- ============================================================
-- PUBLIC RPC: is_tenant_code_available
-- Exposed to the anon role so the public signup flow in SubsTrack
-- can pre-check workspace-code availability before walking the user
-- through the account form. SECURITY DEFINER is required because the
-- tenants SELECT policy hides every row from anon callers — without
-- it the function would always return TRUE. Returning only a boolean
-- (not the row) keeps tenant enumeration limited to a yes/no oracle,
-- which is acceptable since tenant_code is user-chosen and treated
-- like a username.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_tenant_code_available(code TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.tenants
        WHERE tenant_code = lower(trim(code))
    );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_code_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_code_available(TEXT) TO anon, authenticated;

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
--    tier_plans = SaaS subscription tiers (3 global rows: Free, Pro, Business).
--                 Each tenant.tier_id points at one. SuperAdmin edits limits/prices.
--    plans      = customer subscription packages (tenant's staff manage this).
--    These are entirely different concepts. Do not confuse them.

-- 3. PAYMENT INTEGRITY
--    billing_month MUST be YYYY-MM-01. The chk_billing_month_first_day constraint
--    enforces this at the DB level. The app must also normalize before inserting.
--    amount_due and amount_paid are SNAPSHOTS. Never recompute from plan.price.
--    amount_paid < amount_due = partial payment; balance holds the outstanding debt.
--    amount_paid = 0 is treated as unpaid in the app (reserves the row slot).
--    voided payments are retained forever. uq_payments_line_month is per SERVICE
--    LINE (customer_plan_id, billing_month) — a customer with several lines pays
--    each independently; re-paying a voided month upserts the same row.

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

-- ============================================================
-- OFFLINE-FIRST SYNC SUPPORT
-- Server-authoritative updated_at drives the native app's incremental pull
-- (WHERE updated_at > last_pulled_at, latest-updated_at-wins). See docs/offline.md.
-- Placed at the end so every referenced table already exists.
-- ============================================================

-- Server-authoritative updated_at for payments + sales (tables defined above).
CREATE OR REPLACE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_custom_debts_updated_at
    BEFORE UPDATE ON custom_debts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_debt_payments_updated_at
    BEFORE UPDATE ON debt_payments
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_exception_logs_updated_at
    BEFORE UPDATE ON exception_logs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- NOTE: no tombstone table/triggers. The native client propagates hard deletes
-- itself: it pushes a real DELETE for locally-removed rows and, on pull, drops
-- any local row that no longer exists on the server (see sync.ts reconcileDeletes).
