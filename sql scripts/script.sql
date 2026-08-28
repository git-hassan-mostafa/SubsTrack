-- ============================================================
-- HOW TO CHANGE THIS SCRIPT (READ FIRST)
--
-- This file is the FULL schema AND the migration. Every statement is
-- idempotent, so re-running the whole file on a live database is safe and
-- brings it up to date. There are no separate migration files.
--
-- SHAPE OF A TABLE — every table is declared in two steps:
--        CREATE TABLE IF NOT EXISTS <table> ();              -- empty shell
--        ALTER TABLE <table> ADD COLUMN IF NOT EXISTS ...;   -- one per column
--    So a column is declared exactly ONE way whether the table is brand new or
--    already live: there is no CREATE TABLE column list to keep in sync with a
--    separate list of later ALTERs, and every column self-heals on re-run.
--
--  * New table          → CREATE TABLE IF NOT EXISTS <table> (); then its
--    column ALTERs, then its constraints / indexes (IF NOT EXISTS).
--
--  * New column         → append ONE line to that table's column block:
--        ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type> [DEFAULT ...];
--    Keeping it under its own table (not in one section at the bottom) means
--    views, policies and triggers further down always see it.
--    NOT NULL requires a DEFAULT — existing rows must get a value.
--
--  * A single-column CHECK / UNIQUE / REFERENCES (FK) → put it on the ADD COLUMN
--    line itself, prefixed with `CONSTRAINT <name>` when the name matters.
--    A table-level constraint (multi-column CHECK / UNIQUE / FK) cannot ride on
--    an ADD COLUMN, so add it to that table's "Table-level constraints" DO block:
--        IF NOT EXISTS (SELECT 1 FROM pg_constraint
--                       WHERE conrelid = '<table>'::regclass AND conname = '<name>')
--        THEN ALTER TABLE <table> ADD CONSTRAINT <name> ...; END IF;
--    Guarded means EDITING an existing constraint is NOT picked up on a live
--    database — rename it, or drop the old one by hand.
--
--  * Dropping a column → delete its ADD COLUMN line AND add
--        ALTER TABLE <table> DROP COLUMN IF EXISTS <col>;
--    to a "Columns removed" block under that table, so a fresh database and a
--    live one still end up identical. The offline mirror does NOT reconcile
--    this — an old install keeps a harmless stale column.
--
--  * Mirror every column change in the offline client's table descriptor
--    (SubsTrack/src/core/offline/db/tables.ts) or the native app won't store or
--    sync it. That side self-heals the same way (ADD COLUMN on next app start).
--
--  ORDER MATTERS: an inline REFERENCES needs its target table to already exist,
--  so tables stay in dependency order (tier_plans → tenants → branches → …).
-- ============================================================

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

CREATE TABLE IF NOT EXISTS tier_plans ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS code TEXT NOT NULL UNIQUE
    CHECK (code IN ('free', 'pro', 'business'));
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL;

-- Numeric limits (NULL = unlimited)
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_customers INT
    CHECK (max_customers IS NULL OR max_customers >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_users INT
    CHECK (max_users IS NULL OR max_users >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_plans INT
    CHECK (max_plans IS NULL OR max_plans >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_branches INT
    CHECK (max_branches IS NULL OR max_branches >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_currencies INT
    CHECK (max_currencies IS NULL OR max_currencies >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS max_products INT
    CHECK (max_products IS NULL OR max_products >= 0);

-- Feature flags
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS multi_currency_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS multi_month_plans_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Pricing (USD). Stripe price IDs can be added later as nullable columns.
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS price_monthly_usd NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (price_monthly_usd >= 0);
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS price_yearly_usd NUMERIC(10,2)
    CHECK (price_yearly_usd IS NULL OR price_yearly_usd >= 0);

ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tier_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Seed the three tiers. Idempotent via ON CONFLICT — re-runs of the script
-- preserve any limit/price tweaks made later via SuperAdmin.
INSERT INTO tier_plans (
    code, name, sort_order,
    max_customers, max_users, max_plans, max_branches, max_currencies, max_products,
    multi_currency_enabled, multi_month_plans_enabled,
    price_monthly_usd
) VALUES
    ('free',     'Free',     0,   30,   1,    3,    1,    0,    5, FALSE, FALSE,  0),
    ('pro',      'Pro',      1,  300,   5, NULL,    3, NULL, NULL, TRUE,  TRUE,   9),
    ('business', 'Business', 2, NULL, NULL, NULL, NULL, NULL, NULL, TRUE,  TRUE,  29)
ON CONFLICT (code) DO NOTHING;

-- Grace days were removed from the product: a month is unpaid from its first
-- day. Idempotent, so existing databases lose the column on the next run.
ALTER TABLE tier_plans DROP COLUMN IF EXISTS grace_days;

-- ============================================================
-- APP OPTIONS
-- Global key/value config shared across ALL tenants (NOT tenant-scoped).
-- Managed by the SaaS owner via the SuperAdmin "Options" page (service role).
-- The SubsTrack mobile app reads these via RLS (authenticated SELECT only);
-- it never writes. Example: 'LiraRate' = default USD→LBP rate seeded onto
-- each new tenant's auto-created Lebanese Pound (LBP) currency at signup.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_options ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE app_options ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE app_options ADD COLUMN IF NOT EXISTS key TEXT NOT NULL UNIQUE;
ALTER TABLE app_options ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_options ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE app_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE app_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Seed default global options. Idempotent via ON CONFLICT — re-runs of the
-- script preserve any value edited later via SuperAdmin. 'LiraRate' is the
-- default USD→LBP exchange rate (units of LBP per 1 USD) applied to each new
-- tenant's auto-created LBP currency.
INSERT INTO app_options (key, value, description) VALUES
    ('LiraRate', '89000', 'Default USD→LBP exchange rate (LBP per 1 USD) seeded onto each new tenant''s Lebanese Pound currency.'),
    ('AllowPlanUpgrade', 'true', 'When ''false'', tenants cannot self-upgrade in-app; the upgrade button is replaced by a WhatsApp "contact to upgrade" button (uses SupportWhatsAppNumber).'),
    ('AllowSelfServiceSignup', 'true', 'When ''false'', the login screen hides the "Create organization" button and the create-tenant Edge Function rejects new signups.'),
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

CREATE TABLE IF NOT EXISTS tenants ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name TEXT NOT NULL UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_code TEXT NOT NULL UNIQUE
    CHECK (tenant_code ~ '^[a-z0-9]+$');
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Subscription tier. Defaults to Free; SuperAdmin or in-app upgrade flow
-- swaps it. ON DELETE RESTRICT — never lose tier association silently.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_id UUID NOT NULL DEFAULT get_free_tier_id()
    CONSTRAINT fk_tenants_tier REFERENCES tier_plans(id) ON DELETE RESTRICT;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier_upgraded_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tenants_tier_id
    ON tenants (tier_id);

-- ============================================================
-- TENANT SETTINGS
-- Per-tenant key/value config — the tenant-scoped twin of app_options
-- (which is global and SuperAdmin-owned). Written in-app by admins from
-- Admin → Tenant Settings, read by every member of the tenant.
-- Example: 'UnpaidStartRule' = when a month turns unpaid ('month_start'
-- on the 1st, or 'customer_start_day' on the line's start day-of-month).
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_settings ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_tenant_settings_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS key TEXT NOT NULL;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- One row per key per tenant. Also the natural key the offline mirror hashes
-- into a deterministic id, so two devices creating the same setting converge.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_settings_key
    ON tenant_settings (tenant_id, key);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id
    ON tenant_settings (tenant_id);

-- ============================================================
-- CURRENCIES
-- Per-tenant supported non-USD currencies with current rate.
-- USD is the implicit base — never stored as a row.
-- active = false hides the currency from new selections but preserves history.
-- ============================================================

CREATE TABLE IF NOT EXISTS currencies ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE currencies ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_currencies_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS code TEXT NOT NULL
    CONSTRAINT chk_currency_code_format CHECK (code ~ '^[A-Z]{2,8}$' AND code <> 'USD');
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS symbol TEXT;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS rate_per_usd NUMERIC(20,8) NOT NULL
    CHECK (rate_per_usd > 0);
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS decimals INTEGER NOT NULL DEFAULT 2
    CHECK (decimals BETWEEN 0 AND 6);
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

CREATE TABLE IF NOT EXISTS branches ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE branches ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE branches ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_branches_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

CREATE TABLE IF NOT EXISTS users ();

-- ---- Columns --------------------------------------------------------------

-- No DEFAULT: id mirrors auth.users.id, always supplied by the caller.
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('superadmin', 'admin', 'user'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_users_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Branch assignment. NULL = tenant-wide admin (sees all branches).
-- App-level rule (UserService.validate): role = 'user' requires a branch
-- once the tenant has >= 1 branch. Not enforced by DB CHECK because it
-- depends on a count from another table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_users_branch REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

CREATE TABLE IF NOT EXISTS plans ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE plans ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE plans ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price NUMERIC(20,8)
    CHECK (price IS NULL OR price > 0);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_custom_price BOOLEAN NOT NULL DEFAULT FALSE;

-- Number of months this plan covers per payment (1 = monthly, 3 = quarterly, etc.)
-- Multi-month plans must have a fixed bundle price (is_custom_price must be FALSE).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_months INTEGER NOT NULL DEFAULT 1
    CHECK (duration_months >= 1);

-- Currency of the stored price. NULL = USD (the base currency).
-- ON DELETE RESTRICT: cannot drop a currency referenced by a plan.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_plans_currency REFERENCES currencies(id) ON DELETE RESTRICT;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_plans_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Branch this plan belongs to. NULL = SHARED catalog item (available at every branch).
-- This is the OPPOSITE semantic of customers.branch_id (where NULL = unassigned/hidden).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_plans_branch REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- A fixed plan must have a price; a custom-price plan must not.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'plans'::regclass AND conname = 'chk_plan_price_consistency'
    ) THEN
        ALTER TABLE plans ADD CONSTRAINT chk_plan_price_consistency
            CHECK (
                (is_custom_price = FALSE AND price IS NOT NULL)
                OR
                (is_custom_price = TRUE AND price IS NULL)
            );
    END IF;

    -- Multi-month plans cannot have custom pricing (bundle price must be fixed).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'plans'::regclass AND conname = 'chk_multi_month_requires_fixed_price'
    ) THEN
        ALTER TABLE plans ADD CONSTRAINT chk_multi_month_requires_fixed_price
            CHECK (duration_months = 1 OR is_custom_price = FALSE);
    END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS customers ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE customers ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Optional Google Maps share link pasted by staff. Stored raw (not parsed
-- into coordinates) — the collector re-opens it to get directions.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_url TEXT;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_regular BOOLEAN NOT NULL DEFAULT TRUE;

-- NOTE: a customer's plan(s) now live in the customer_plans table (one row
-- per service line). customers.plan_id was removed — see customer_plans below.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_customers_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Branch this customer belongs to. NULL = UNASSIGNED — visible ONLY to
-- tenant-wide admins (users with users.branch_id IS NULL). Branch-scoped
-- users do not see unassigned customers.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_customers_branch REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- cancelled_at must be set when and only when active = false
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'customers'::regclass AND conname = 'chk_customer_cancelled_consistency'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT chk_customer_cancelled_consistency
            CHECK (
                (active = TRUE  AND cancelled_at IS NULL)
                OR
                (active = FALSE AND cancelled_at IS NOT NULL)
            );
    END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS customer_plans ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS customer_id UUID NOT NULL
    CONSTRAINT fk_customer_plans_customer REFERENCES customers(id) ON DELETE CASCADE;

-- The plan this line is on. NULL = custom/occasional (ad-hoc amounts).
-- ON DELETE SET NULL: dropping a plan leaves the line plan-less, history intact.
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS plan_id UUID
    CONSTRAINT fk_customer_plans_plan REFERENCES plans(id) ON DELETE SET NULL;

ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL;
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_customer_plans_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- A privately negotiated price for THIS line only, replacing the plan's price.
-- NULL = charge the plan's price (or ask, on a custom-price / plan-less line).
-- Single-month lines only: a multi-month plan's price is a bundle, so the
-- override is refused in CustomerPlanService (a CHECK cannot see plans.duration_months).
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS custom_price NUMERIC(20,8)
    CHECK (custom_price IS NULL OR custom_price > 0);

-- Currency of custom_price. NULL = USD, as everywhere.
-- ON DELETE RESTRICT: soft-delete a currency (active = false) instead.
ALTER TABLE customer_plans ADD COLUMN IF NOT EXISTS custom_currency_id UUID
    REFERENCES currencies(id) ON DELETE RESTRICT;

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- cancelled_at must be set when and only when active = false
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'customer_plans'::regclass
          AND conname = 'chk_customer_plan_cancelled_consistency'
    ) THEN
        ALTER TABLE customer_plans ADD CONSTRAINT chk_customer_plan_cancelled_consistency
            CHECK (
                (active = TRUE  AND cancelled_at IS NULL)
                OR
                (active = FALSE AND cancelled_at IS NOT NULL)
            );
    END IF;
END $$;

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

CREATE OR REPLACE TRIGGER trg_tenant_settings_updated_at
    BEFORE UPDATE ON tenant_settings
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

-- sales / charges / collections updated_at triggers are defined at the end of
-- this file, after those tables exist.

-- ============================================================
-- PRODUCTS
-- One-off sellable items (routers, supplements, installation fees…).
-- Distinct from `plans` (recurring subscriptions). Soft-delete via
-- active = false — preserves sale history when a product is retired.
-- Branch semantics mirror plans: branch_id IS NULL = SHARED catalog item.
-- ============================================================

CREATE TABLE IF NOT EXISTS products ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_products_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- NULL = SHARED (visible to every branch). NOT NULL = scoped to one branch.
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_products_branch REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(20,8) NOT NULL CHECK (price > 0);

-- Currency the price is stored in. NULL = USD (the base).
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_products_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- What the product COSTS to buy (the default that pre-fills a restock), as
-- opposed to `price` above, which is what it sells for. NULL = unknown, and a
-- restock then simply records no cost. Live like `price`, never frozen — each
-- restock freezes its own cost onto the stock_movements row.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(20,8)
    CHECK (cost_price IS NULL OR cost_price > 0);

-- Currency of cost_price. NULL = USD. (`currency_id` above is the SELLING
-- currency, so the cost needs its own.)
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_currency_id UUID
    CONSTRAINT fk_products_cost_currency REFERENCES currencies(id) ON DELETE RESTRICT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
-- SERVICES
-- The price list of LABOUR a tenant sells: installation, a repair visit, a
-- router setup. The twin of `products` for work instead of goods, so it carries
-- NO stock ledger and NO cost columns — nothing is bought, so nothing is an
-- expense (staff pay is typed by hand under the `salaries` expense category).
-- A service is sold as a LINE ON A SALE (sale_items.line_type = 'service'), so
-- every money figure in the app counts it through the sale header already.
-- A one-off job that is not worth listing here needs no row at all — the sale
-- form can type its name straight onto the line.
-- Soft-delete via active = false; branch_id IS NULL = SHARED, like products.
-- ============================================================

CREATE TABLE IF NOT EXISTS services ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE services ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE services ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_services_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- NULL = SHARED (visible to every branch). NOT NULL = scoped to one branch.
ALTER TABLE services ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_services_branch REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE services ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS price NUMERIC(20,8) NOT NULL CHECK (price > 0);

-- Currency the price is stored in. NULL = USD (the base).
ALTER TABLE services ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_services_currency REFERENCES currencies(id) ON DELETE RESTRICT;

ALTER TABLE services ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Same-name uniqueness rules as products: shared + branch-specific can coexist
-- because NULLs compare unequal in a Postgres unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_name_tenant_branch
    ON services (tenant_id, branch_id, name);

CREATE INDEX IF NOT EXISTS idx_services_tenant_id
    ON services (tenant_id);

CREATE INDEX IF NOT EXISTS idx_services_branch_id
    ON services (branch_id);

CREATE OR REPLACE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SALES (header)
-- Ledger of one-off product sales — the HEADER of a sale. Customer is OPTIONAL
-- (walk-in supported). A sale holds one OR MORE items — products, services, or
-- both — each a row in the sale_items child table. The header
-- carries the single sale-wide currency + frozen rate and the summed total.
-- It holds NO money received and NO custody: what is OWED for a sale is its
-- charges row and what was COLLECTED is a collections row, so the sale document
-- only ever says what was sold. items_summary, total_amount and
-- rate_per_usd_snapshot are frozen at write time and never recomputed.
-- Soft-void only — historical totals stay accurate.
-- One currency per sale: every line's unit_amount is in currency_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE sales ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_sales_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Branch where the sale was recorded. Inherited from the recording user
-- (or chosen by tenant-wide admins). NULL = sold by a tenant-wide admin
-- with no branch context (rare but legal).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_sales_branch REFERENCES branches(id) ON DELETE SET NULL;

-- Frozen human summary of everything in this sale (e.g. "Water ×2, Installation").
-- Powers list search + the list/debt/wallet labels WITHOUT joining sale_items.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS items_summary TEXT NOT NULL;

-- NULL = walk-in / anonymous sale. Customer can be removed without orphaning it.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id UUID
    CONSTRAINT fk_sales_customer REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID
    CONSTRAINT fk_sales_recorded_by REFERENCES users(id) ON DELETE SET NULL;

-- Sum of every sale_items line's (unit_amount * quantity), in currency_id.
-- App-written at sale time (a generated column cannot sum a child table).
-- Snapshot — never recomputed.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_amount NUMERIC(20,8) NOT NULL
    CHECK (total_amount > 0);

-- Currency the amounts above are stored in. NULL = USD.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_sales_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- Exchange rate (units of currency_id per 1 USD) frozen at recording time.
-- USD sales (currency_id IS NULL) always store 1. Mirrors charges.rate_per_usd_snapshot.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rate_per_usd_snapshot NUMERIC(20,8) NOT NULL
    CHECK (rate_per_usd_snapshot > 0);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Soft-void fields. Set together or not at all. Reason required when set.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_by UUID
    CONSTRAINT fk_sales_voided_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT;

-- No table-level constraints: the money that used to need them (amount_paid,
-- custody) now lives on charges + collections.

CREATE INDEX IF NOT EXISTS idx_sales_tenant_sold_at
    ON sales (tenant_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_customer
    ON sales (customer_id)
    WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_branch
    ON sales (branch_id);

-- ============================================================
-- SALE ITEMS (lines)
-- One row per thing sold within a sale — a PRODUCT (goods, moves stock) or a
-- SERVICE (labour, moves nothing). A sale (header) has one or more of these, in
-- any mix — products only, services only, or both.
-- item_name_snapshot + unit_amount are frozen at sale time (survive product /
-- service renames and soft-deletes). unit_amount is in the parent sale's
-- currency — every line shares one currency. line total = unit_amount * quantity
-- is derived in the app (no stored column). No branch_id: branch is inherited
-- via the parent sale (RLS EXISTS), exactly like collection_items inherit via
-- the parent collection.
-- ============================================================

CREATE TABLE IF NOT EXISTS sale_items ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();

-- Deleting the parent sale removes its lines.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS sale_id UUID NOT NULL
    CONSTRAINT fk_sale_items_sale REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_sale_items_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- What this line sells. Defaulted so every pre-services row reads correctly.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_type TEXT NOT NULL DEFAULT 'product'
    CONSTRAINT chk_sale_items_line_type CHECK (line_type IN ('product', 'service'));

-- Products referenced by a sale line cannot be hard-deleted. Use active = false.
-- NULL on a service line — see chk_sale_items_line_ref below.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_id UUID
    CONSTRAINT fk_sale_items_product REFERENCES products(id) ON DELETE RESTRICT;

-- Only ever NOT NULL before services existed, so this loosens the live column.
-- Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL;

-- Set only on a service line, and only when it came from the catalog. NULL on a
-- ONE-OFF typed service, whose name in item_name_snapshot is the whole record of
-- what was sold. Like products, a referenced service cannot be hard-deleted.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS service_id UUID
    CONSTRAINT fk_sale_items_service REFERENCES services(id) ON DELETE RESTRICT;

-- Snapshot of the product's or service's name at sale time — for a one-off
-- service it is the name itself, typed on the form.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS item_name_snapshot TEXT NOT NULL;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1
    CHECK (quantity > 0);

-- Per-unit price at sale time, in the parent sale's currency. May differ
-- from product.price (discount, rounding, currency conversion). Snapshot.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_amount NUMERIC(20,8) NOT NULL
    CHECK (unit_amount > 0);

-- A line dropped by an EDIT is soft-voided, never deleted: the offline sync has
-- no tombstones for sale_items, so a deleted row would live on forever in every
-- other device's mirror. Readers filter it out in the mapper.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sale_items_sale
    ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_tenant
    ON sale_items (tenant_id);

-- Drives the product reference count (soft-vs-hard delete of a product).
CREATE INDEX IF NOT EXISTS idx_sale_items_product
    ON sale_items (product_id);

-- Same job for services.
CREATE INDEX IF NOT EXISTS idx_sale_items_service
    ON sale_items (service_id);

-- ---- Table-level constraints ----------------------------------------------
-- Multi-column, so it cannot ride on a column's ALTER line. NOTE: this block is
-- guarded, so EDITING the rule is not picked up on a live DB — rename it or drop
-- the old constraint by hand.

DO $$
BEGIN
    -- A line points at exactly the one thing its type says it sells. A service
    -- line may still have a NULL service_id: that is the one-off typed service,
    -- whose name in item_name_snapshot is the whole record.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_line_ref'
    ) THEN
        ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_line_ref CHECK (
            (line_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
            OR (line_type = 'service' AND product_id IS NULL)
        );
    END IF;
END $$;

CREATE OR REPLACE TRIGGER trg_sale_items_updated_at
    BEFORE UPDATE ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- STOCK MOVEMENTS
-- Append-only ledger of every change to a product's stock. Stock on hand is
-- DERIVED at runtime as SUM(quantity_delta) per product — never stored as a
-- counter, same principle as debts and the collector wallet. Additive rows also
-- merge cleanly offline: two devices each selling one unit produce two rows
-- instead of clobbering one another's counter.
-- No branch_id: branch is inherited via the parent product (RLS EXISTS),
-- exactly like sale_items inherit via the parent sale.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_stock_movements_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- A hard-deleted product (one with no sales) takes its ledger with it.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS product_id UUID NOT NULL
    CONSTRAINT fk_stock_movements_product REFERENCES products(id) ON DELETE CASCADE;

-- Signed, never zero: positive adds stock (restock), negative removes it (sale).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS quantity_delta INTEGER NOT NULL
    CHECK (quantity_delta <> 0);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL
    CONSTRAINT chk_stock_movements_reason
    CHECK (reason IN ('initial', 'restock', 'adjustment', 'sale'));

-- Set only for reason = 'sale', so a movement traces back to its sale.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS sale_id UUID
    CONSTRAINT fk_stock_movements_sale REFERENCES sales(id) ON DELETE CASCADE;

-- What one unit cost to BUY ('initial' / 'restock', and a NEGATIVE 'adjustment'
-- that hands the money back — a wrong entry or stock returned to the supplier).
-- This is the only money on the ledger, and it is what makes a stock purchase an
-- expense: the Expenses view derives one row per costed non-sale movement
-- (amount = quantity_delta * unit_cost, so a negative row is a credit and is the
-- only way a stock expense comes back down). NULL = no cost recorded, so the
-- movement contributes nothing — true for every legacy row, every 'sale', and a
-- removal for damage or loss (the money was spent; only the goods are gone).
-- The three columns are always written together.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(20,8)
    CHECK (unit_cost IS NULL OR unit_cost >= 0);

-- Currency unit_cost is stored in. NULL = USD.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_stock_movements_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- Rate frozen when the stock was bought, same drift-free principle as
-- charges/collections.rate_per_usd_snapshot. 1 for USD.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS rate_per_usd_snapshot NUMERIC(20,8)
    CHECK (rate_per_usd_snapshot IS NULL OR rate_per_usd_snapshot > 0);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID
    CONSTRAINT fk_stock_movements_recorded_by REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Soft-void, like every other ledger. Voiding a sale VOIDS its movements
-- rather than inserting opposite ones: one statement, and replaying it is
-- harmless, so a double void can never give the stock back twice.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_by UUID
    CONSTRAINT fk_stock_movements_voided_by REFERENCES users(id) ON DELETE SET NULL;

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'stock_movements'::regclass AND conname = 'chk_stock_movements_sale_link'
    ) THEN
        ALTER TABLE stock_movements ADD CONSTRAINT chk_stock_movements_sale_link
            CHECK (
                (reason =  'sale' AND sale_id IS NOT NULL AND quantity_delta < 0)
                OR
                (reason <> 'sale' AND sale_id IS NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'stock_movements'::regclass
          AND conname = 'chk_stock_movements_void_consistency'
    ) THEN
        ALTER TABLE stock_movements ADD CONSTRAINT chk_stock_movements_void_consistency
            CHECK (
                (voided_at IS NULL AND voided_by IS NULL)
                OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL)
            );
    END IF;
END $$;

-- Deliberately NO check that the running total stays >= 0. Selling more than
-- you hold is blocked in the app, but the DB must accept whatever an offline
-- device replays — a rejected push would retry forever and, because the sync
-- upserts a table's dirty rows as one batch, would block every other movement.

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
    ON stock_movements (product_id) WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant
    ON stock_movements (tenant_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_sale
    ON stock_movements (sale_id) WHERE sale_id IS NOT NULL;

-- The Expenses view: costed, live, non-sale rows in a date range. Both signs —
-- a negative one is a credit (wrong entry / stock returned), which is the only
-- way to bring a stock expense back down. Renamed from idx_stock_movements_cost
-- because CREATE INDEX IF NOT EXISTS never updates an existing predicate.
CREATE INDEX IF NOT EXISTS idx_stock_movements_cost_live
    ON stock_movements (occurred_at)
    WHERE unit_cost IS NOT NULL AND reason <> 'sale' AND voided_at IS NULL;

CREATE OR REPLACE TRIGGER trg_stock_movements_updated_at
    BEFORE UPDATE ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Stock on hand per product. security_invoker keeps the caller's RLS on
-- stock_movements in force, so the view is tenant/branch safe by construction.
-- Requires PostgreSQL 15+ — on older servers the view would silently run as its
-- owner and leak every tenant's stock.
CREATE OR REPLACE VIEW product_stock WITH (security_invoker = true) AS
    SELECT product_id, tenant_id, SUM(quantity_delta)::INT AS on_hand
    FROM stock_movements
    WHERE voided_at IS NULL
    GROUP BY product_id, tenant_id;

GRANT SELECT ON product_stock TO authenticated;

-- ============================================================
-- CHARGES  (what a customer OWES — the bill)
-- One row per thing owed:
--   kind='month'  a subscription month for ONE service line. Created LAZILY —
--                 only when money first touches the month (or an admin bills
--                 it). An untouched unpaid month has NO row; it is computed by
--                 PaymentService.buildMonthGrid, exactly as before.
--   kind='sale'   the money side of a sales row. The sale document keeps what
--                 was sold; the charge owns what is owed.
--   kind='manual' a hand-typed debt (installation fee, penalty…).
-- amount is a SNAPSHOT, frozen with its currency + rate. What has been paid is
-- NEVER a column here — it is SUM(collection_items) (see the charge_balances
-- view). Two devices can therefore both collect offline without clobbering.
-- Two ways a charge stops being owed, and they mean different things:
--   voided_at      the bill was a MISTAKE — it never existed.
--   written_off_at the bill is REAL but will never be paid — a recorded LOSS.
-- Branch: inherited from the customer (like payments used to). branch_id is its
-- own column used ONLY for a customer-less walk-in sale charge, which has no
-- customer to inherit from.
-- ============================================================

CREATE TABLE IF NOT EXISTS charges ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE charges ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE charges ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_charges_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Only consulted when customer_id IS NULL (walk-in sale). Otherwise the branch
-- is the customer's, so a customer moving branch takes their debts with them.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_charges_branch REFERENCES branches(id) ON DELETE SET NULL;

-- NULL only for a walk-in sale charge. A month or manual charge always has one.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS customer_id UUID
    CONSTRAINT fk_charges_customer REFERENCES customers(id) ON DELETE CASCADE;

-- 'month' | 'sale' | 'manual'. Free text in the DB — the app owns the code list,
-- so a new kind needs no migration. chk_charges_kind_ref below keeps the
-- kind-specific columns honest.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL;

-- ---- kind = 'month' -------------------------------------------------------
-- The service line this month belongs to. Uniqueness is per line + month, so a
-- customer with several lines gets one charge per line for the same month.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS customer_plan_id UUID
    CONSTRAINT fk_charges_customer_plan REFERENCES customer_plans(id) ON DELETE CASCADE;

-- Always the first day of the month (YYYY-MM-01).
ALTER TABLE charges ADD COLUMN IF NOT EXISTS billing_month DATE
    CONSTRAINT chk_charges_billing_month_first_day
    CHECK (billing_month IS NULL OR EXTRACT(DAY FROM billing_month) = 1);

-- Consecutive months this ONE bill covers (1 = single, 3 = a quarter bundle).
-- billing_month is the FIRST month of the block. A multi-month payment stays a
-- single charge so the coverage map / "Included" cells are unchanged.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS duration_months INTEGER NOT NULL DEFAULT 1
    CHECK (duration_months >= 1);

-- Snapshot of which plan/price applied when the bill was raised. NULL = custom.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS plan_id UUID
    CONSTRAINT fk_charges_plan REFERENCES plans(id) ON DELETE SET NULL;

-- ---- kind = 'sale' --------------------------------------------------------
ALTER TABLE charges ADD COLUMN IF NOT EXISTS sale_id UUID
    CONSTRAINT fk_charges_sale REFERENCES sales(id) ON DELETE CASCADE;

-- ---- kind = 'manual' ------------------------------------------------------
ALTER TABLE charges ADD COLUMN IF NOT EXISTS description TEXT;

-- ---- Money ----------------------------------------------------------------
-- What is owed, in currency_id (NULL = USD). Frozen — never recomputed from a
-- plan or a product price.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS amount NUMERIC(20,8) NOT NULL
    CHECK (amount > 0);
ALTER TABLE charges ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_charges_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- Units of currency_id per 1 USD, frozen when the bill was raised. USD = 1.
-- This is what converts the OUTSTANDING balance to USD (what he was billed);
-- collections carry their own rate for what was actually collected.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS rate_per_usd_snapshot NUMERIC(20,8) NOT NULL
    CHECK (rate_per_usd_snapshot > 0);

-- ---- Dates ----------------------------------------------------------------
-- When the bill was raised (may be long after due_date — a January month billed
-- in March when the collector finally came).
ALTER TABLE charges ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- When it must be paid. THE sort key for the oldest-first waterfall and the
-- only source of ageing. month → the billing day; sale → sold_at, or later for
-- a pay-later sale; manual → picked by staff.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS due_date DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE charges ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID
    CONSTRAINT fk_charges_recorded_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE charges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- Void: the bill was a mistake, it never existed ------------------------
ALTER TABLE charges ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS voided_by UUID
    CONSTRAINT fk_charges_voided_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- ---- Write-off: the bill is real but will never be paid (a LOSS) -----------
ALTER TABLE charges ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS written_off_by UUID
    CONSTRAINT fk_charges_written_off_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS write_off_reason TEXT;

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- Each kind fills its own columns and no other's. Same shape as
    -- chk_sale_items_line_ref. A 'sale' charge may have no customer (walk-in).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'chk_charges_kind_ref'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT chk_charges_kind_ref
            CHECK (
                (kind = 'month'
                    AND customer_id IS NOT NULL
                    AND customer_plan_id IS NOT NULL AND billing_month IS NOT NULL
                    AND sale_id IS NULL)
                OR
                (kind = 'sale'
                    AND sale_id IS NOT NULL
                    AND customer_plan_id IS NULL AND billing_month IS NULL)
                OR
                (kind = 'manual'
                    AND customer_id IS NOT NULL
                    AND description IS NOT NULL
                    AND customer_plan_id IS NULL AND billing_month IS NULL
                    AND sale_id IS NULL)
            );
    END IF;

    -- voided_at and voided_by must be set together
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'chk_charges_void_consistency'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT chk_charges_void_consistency
            CHECK (
                (voided_at IS NULL AND voided_by IS NULL)
                OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL)
            );
    END IF;

    -- written_off_at and written_off_by must be set together
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'chk_charges_write_off_consistency'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT chk_charges_write_off_consistency
            CHECK (
                (written_off_at IS NULL AND written_off_by IS NULL)
                OR
                (written_off_at IS NOT NULL AND written_off_by IS NOT NULL)
            );
    END IF;

    -- A mistake and a loss are mutually exclusive statements about one bill.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'chk_charges_void_xor_write_off'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT chk_charges_void_xor_write_off
            CHECK (voided_at IS NULL OR written_off_at IS NULL);
    END IF;

    -- One bill per service line per month. The natural key the offline mirror
    -- hashes into a deterministic id, so two devices collecting the same month
    -- converge on ONE row instead of colliding here (gotcha #1).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'uq_charges_line_month'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT uq_charges_line_month
            UNIQUE (customer_plan_id, billing_month);
    END IF;

    -- One bill per sale.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'charges'::regclass AND conname = 'uq_charges_sale'
    ) THEN
        ALTER TABLE charges ADD CONSTRAINT uq_charges_sale UNIQUE (sale_id);
    END IF;
END $$;

-- NOTE: there is deliberately NO check that SUM(collection_items) <= amount.
-- The server must accept whatever an offline device replays — the same reason
-- stock_movements has no on_hand >= 0 check. Overpay is refused in the service.

CREATE INDEX IF NOT EXISTS idx_charges_tenant_id
    ON charges (tenant_id);

CREATE INDEX IF NOT EXISTS idx_charges_customer_id
    ON charges (customer_id);

CREATE INDEX IF NOT EXISTS idx_charges_customer_plan_id
    ON charges (customer_plan_id);

-- The debts list and the waterfall both walk a tenant's bills by due date.
CREATE INDEX IF NOT EXISTS idx_charges_tenant_due_date
    ON charges (tenant_id, due_date);

CREATE INDEX IF NOT EXISTS idx_charges_sale_id
    ON charges (sale_id)
    WHERE sale_id IS NOT NULL;

-- ============================================================
-- COLLECTIONS  (money physically handed over — the header)
-- One row = ONE hand-over of cash: "$55, 20 Mar, taken by Sami". Where it went
-- is the collection_items child table — one hand-over can settle several bills
-- (the oldest-first waterfall), and one bill can receive several hand-overs
-- (installments). That many-to-many is the whole reason this table exists
-- separately from charges.
-- ONE CURRENCY PER COLLECTION, and it must equal the currency of every charge
-- it pays — which is why collection_items carries no currency of its own. A
-- customer owing in two currencies is collected from twice.
-- This is now the ONLY table in the schema carrying wallet custody.
-- ============================================================

CREATE TABLE IF NOT EXISTS collections ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE collections ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE collections ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_collections_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Only consulted when customer_id IS NULL (walk-in sale), like charges.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_collections_branch REFERENCES branches(id) ON DELETE SET NULL;

-- NULL only for a walk-in sale's cash.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS customer_id UUID
    CONSTRAINT fk_collections_customer REFERENCES customers(id) ON DELETE CASCADE;

-- The physical cash handed over, in currency_id (NULL = USD). Equals the sum of
-- its items — enforced in the service, not here, because an offline replay must
-- always be accepted.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS amount NUMERIC(20,8) NOT NULL
    CHECK (amount > 0);
ALTER TABLE collections ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_collections_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- Units of currency_id per 1 USD, frozen when the money arrived. USD = 1.
-- THIS is the rate every revenue and wallet figure uses (cash basis).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS rate_per_usd_snapshot NUMERIC(20,8) NOT NULL
    CHECK (rate_per_usd_snapshot > 0);

-- When the money arrived. The revenue date — never a billing month.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE collections ADD COLUMN IF NOT EXISTS received_by_user_id UUID
    CONSTRAINT fk_collections_received_by REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE collections ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE collections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Soft void. Voiding the header un-applies every one of its items at once, so
-- all the balances it touched come back — one action, one reason, one audit row.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS voided_by UUID
    CONSTRAINT fk_collections_voided_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Collector wallet: who physically holds this cash RIGHT NOW. Starts as the
-- receiving user and moves up the chain on each handover (collector → branch
-- admin → tenant-wide admin). NULL = in nobody's wallet.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS held_by_user_id UUID
    CONSTRAINT fk_collections_held_by REFERENCES users(id) ON DELETE SET NULL;

-- Final settlement: when the cash left the wallet chain and who took it out.
-- Set together, and only alongside held_by_user_id = NULL (chk_collections_custody).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS remitted_at TIMESTAMPTZ;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS remitted_by UUID
    CONSTRAINT fk_collections_remitted_by REFERENCES users(id) ON DELETE SET NULL;

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'collections'::regclass AND conname = 'chk_collections_void_consistency'
    ) THEN
        ALTER TABLE collections ADD CONSTRAINT chk_collections_void_consistency
            CHECK (
                (voided_at IS NULL AND voided_by IS NULL)
                OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'collections'::regclass AND conname = 'chk_collections_remitted_consistency'
    ) THEN
        ALTER TABLE collections ADD CONSTRAINT chk_collections_remitted_consistency
            CHECK (
                (remitted_at IS NULL AND remitted_by IS NULL)
                OR
                (remitted_at IS NOT NULL AND remitted_by IS NOT NULL)
            );
    END IF;

    -- Settled cash is in nobody's wallet
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'collections'::regclass AND conname = 'chk_collections_custody'
    ) THEN
        ALTER TABLE collections ADD CONSTRAINT chk_collections_custody
            CHECK (remitted_at IS NULL OR held_by_user_id IS NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collections_tenant_received_at
    ON collections (tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_collections_customer_id
    ON collections (customer_id);

-- Collector wallet: the cash a user is holding (not settled, not voided).
CREATE INDEX IF NOT EXISTS idx_collections_holder
    ON collections (held_by_user_id)
    WHERE held_by_user_id IS NOT NULL AND voided_at IS NULL;

-- ============================================================
-- COLLECTION ITEMS  (which bill the money paid — the lines)
-- One row per charge a collection settles. amount is in the PARENT
-- COLLECTION's currency, which the service guarantees equals the charge's — so
-- this table needs no currency or rate of its own and a balance always closes
-- at exactly zero (no rate drift, no leftover 3 LBP).
-- No branch_id: inherited via the parent collection (RLS EXISTS), exactly like
-- sale_items inherit via the parent sale.
-- Never soft-voided on its own — voiding the parent collection un-applies the
-- whole hand-over, which is the only truthful unit to undo.
-- ============================================================

CREATE TABLE IF NOT EXISTS collection_items ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_collection_items_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS collection_id UUID NOT NULL
    CONSTRAINT fk_collection_items_collection REFERENCES collections(id) ON DELETE CASCADE;
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS charge_id UUID NOT NULL
    CONSTRAINT fk_collection_items_charge REFERENCES charges(id) ON DELETE CASCADE;

ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS amount NUMERIC(20,8) NOT NULL
    CHECK (amount > 0);

ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- A collection pays a given bill at most once — an edit updates the line.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'collection_items'::regclass AND conname = 'uq_collection_items_pair'
    ) THEN
        ALTER TABLE collection_items ADD CONSTRAINT uq_collection_items_pair
            UNIQUE (collection_id, charge_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_collection_items_charge_id
    ON collection_items (charge_id);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id
    ON collection_items (collection_id);

-- ============================================================
-- CHARGE BALANCES (view)
-- What is still owed on every live bill. Balance is NEVER a stored column —
-- same rule as product_stock: an offline device must be able to add money
-- without clobbering a counter. Voiding a collection makes its items vanish
-- from here and the balance comes back on its own, with nothing to recompute.
-- Excludes voided bills (a mistake) and written-off bills (a recorded loss) —
-- neither is owed any more.
-- ============================================================

CREATE OR REPLACE VIEW charge_balances WITH (security_invoker = true) AS
    SELECT c.id,
           c.tenant_id,
           c.amount,
           COALESCE(SUM(i.amount), 0)            AS paid,
           c.amount - COALESCE(SUM(i.amount), 0) AS balance
    FROM charges c
    LEFT JOIN collection_items i ON i.charge_id = c.id
    LEFT JOIN collections p ON p.id = i.collection_id AND p.voided_at IS NULL
    WHERE c.voided_at IS NULL AND c.written_off_at IS NULL
    GROUP BY c.id;

GRANT SELECT ON charge_balances TO authenticated;


-- ============================================================
-- EXPENSES
-- Money the business SPENT — the counterweight to the three cash-in ledgers
-- (the collections ledger), so the dashboard can show a real net.
-- Only HAND-TYPED expenses are stored here (rent, salaries, fuel…). The cost of
-- buying stock is NOT a row in this table: it is DERIVED at runtime from
-- stock_movements.unit_cost, so correcting stock corrects the expense too — a
-- costed negative movement is how an over-stated stock expense comes back down.
-- Owns its branch_id (NULL = a company-wide expense), unlike debts which
-- inherit via the customer. ADMIN-ONLY (RLS) — salaries and rent are not staff
-- business. Soft-void only; there is no edit.
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_expenses_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- NULL = a company-wide expense (not charged to any one branch).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID
    CONSTRAINT fk_expenses_branch REFERENCES branches(id) ON DELETE SET NULL;

-- What kind of expense. Free text at the DB level (the app owns the code list
-- in expenseCategories.ts) so a new category never needs a migration.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';

-- What the money went on. Shown as the row label.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(20,8) NOT NULL
    CHECK (amount > 0);

-- Currency the amount is stored in. NULL = USD.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency_id UUID
    CONSTRAINT fk_expenses_currency REFERENCES currencies(id) ON DELETE RESTRICT;

-- Rate frozen at recording time (units per 1 USD; 1 for USD).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rate_per_usd_snapshot NUMERIC(20,8) NOT NULL
    CHECK (rate_per_usd_snapshot > 0);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID
    CONSTRAINT fk_expenses_recorded_by REFERENCES users(id) ON DELETE SET NULL;

-- When the money actually went out — user-picked, and what every month bucket
-- keys off. NOT created_at: last month's rent can be entered today.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS incurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Soft-void fields. Set together or not at all.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS voided_by UUID
    CONSTRAINT fk_expenses_voided_by REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'expenses'::regclass AND conname = 'chk_expenses_void_consistency'
    ) THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expenses_void_consistency
            CHECK (
                (voided_at IS NULL AND voided_by IS NULL)
                OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_incurred
    ON expenses (tenant_id, incurred_at);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_id
    ON expenses (branch_id);

-- ============================================================
-- SKIPPED MONTHS
-- A month a service line is NOT expected to pay (vacation, free month, …).
-- One row per (service line, month) — the same grain as a month charge — and the
-- state is a BOOLEAN toggle: skip = true, unskip = false. The row is kept
-- either way so `updated_at` carries the change to other devices (offline
-- sync is latest-updated_at-wins; a deleted row would carry nothing).
-- Carries NO money: skipping never creates or clears a debt.
-- No branch_id: inherited via the customer, exactly like charges.
-- ============================================================

CREATE TABLE IF NOT EXISTS skipped_months ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_skipped_months_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS customer_id UUID NOT NULL
    CONSTRAINT fk_skipped_months_customer REFERENCES customers(id) ON DELETE CASCADE;

-- The service line this month belongs to.
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS customer_plan_id UUID NOT NULL
    CONSTRAINT fk_skipped_months_customer_plan REFERENCES customer_plans(id) ON DELETE CASCADE;

ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS billing_month DATE NOT NULL
    CONSTRAINT chk_skipped_months_billing_month_first_day
    CHECK (EXTRACT(DAY FROM billing_month) = 1);

-- false = the skip was removed (the row stays as history).
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT TRUE;

-- Optional reason shown on the month cell / skip sheet.
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS skipped_by_user_id UUID
    CONSTRAINT fk_skipped_months_skipped_by REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE skipped_months ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ---- Table-level constraints (multi-column — cannot ride on an ADD COLUMN) --

DO $$ BEGIN
    -- One skip state per service line per month (mirrors the charges natural key,
    -- and lets offline derive a deterministic id so two devices converge).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'skipped_months'::regclass AND conname = 'uq_skipped_months_line_month'
    ) THEN
        ALTER TABLE skipped_months ADD CONSTRAINT uq_skipped_months_line_month
            UNIQUE (customer_plan_id, billing_month);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skipped_months_tenant_id
    ON skipped_months (tenant_id);

CREATE INDEX IF NOT EXISTS idx_skipped_months_customer_id
    ON skipped_months (customer_id);

CREATE INDEX IF NOT EXISTS idx_skipped_months_active_month
    ON skipped_months (billing_month)
    WHERE skipped;

-- ============================================================
-- EXCEPTION LOGS
-- Local-first crash/error log written by the native app's global error
-- logger (React ErrorBoundary, RN ErrorUtils global handler, repository
-- catch blocks). Synced PUSH-ONLY from client to server — the server copy
-- is a centralized read sink for developers and is never pulled back down
-- into any device's local SQLite mirror (see docs/offline.md).
-- ============================================================

CREATE TABLE IF NOT EXISTS exception_logs ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();

-- Nullable: an error can occur before a tenant/user is established (e.g. login screen).
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS tenant_id UUID
    CONSTRAINT fk_exception_logs_tenant REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS user_id UUID
    CONSTRAINT fk_exception_logs_user REFERENCES users(id) ON DELETE SET NULL;

-- Snapshot so the log stays readable if the user row is later deleted.
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS username TEXT;

-- Where the error was caught: 'boundary' | 'global_handler' | 'repository' | 'service'.
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL;
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS message TEXT NOT NULL;
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS stack TEXT;

-- Free-form extra info (e.g. which repository/table was involved).
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS context TEXT;

ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE exception_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_exception_logs_tenant_id
    ON exception_logs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_exception_logs_occurred_at
    ON exception_logs (occurred_at);

-- ============================================================
-- AUDIT LOGS
-- Append-only trail of every create / edit / delete / void the app makes:
-- who did it, when, and which fields changed from what to what.
--
-- WRITTEN BY THE APP, NEVER BY A TRIGGER. A trigger only fires when the row
-- reaches Postgres, which for an offline device is at the next sync — it would
-- record the sync moment and the syncing session instead of the real action and
-- the real person, and an offline device would hold no history at all. So the
-- client builds the row next to the change (inside the same local transaction).
--
-- The client mirror keeps a rolling 30-day window (TableSpec.pullDays); the
-- server keeps everything, and the full trail is read online on demand.
-- See docs/features.md → Audit Trail.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs ();

-- ---- Columns --------------------------------------------------------------

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT uuid_generate_v4();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL
    CONSTRAINT fk_audit_logs_tenant REFERENCES tenants(id) ON DELETE CASCADE;

-- Denormalized from the changed row (or its parent) so a branch-scoped admin
-- filters on one column instead of an EXISTS per audited table.
-- NULL = a tenant-wide record (currencies, settings) → every admin sees it.
-- Deliberately NO foreign key: every other table uses ON DELETE SET NULL, which
-- here would blank the trail when a branch is deleted. Evidence must outlive it.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id UUID;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS table_name TEXT NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_id UUID NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action TEXT NOT NULL
    CONSTRAINT chk_audit_logs_action
    CHECK (action IN ('create', 'update', 'delete', 'void', 'restore'));

-- update/void/restore: ONLY the changed columns. delete: the whole row. create: NULL.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_data JSONB;
-- create: the whole new row. update/void/restore: ONLY the changed columns. delete: NULL.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_data JSONB;
-- update/void/restore: ["amount_paid","notes"]. Otherwise NULL.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changed JSONB;

-- Frozen one-line description, so the entry stays readable after the row is gone.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS subject TEXT;

-- The same owner as an id — what a customer's whole timeline filters on.
-- Frozen like `subject` and never joined back, so no FK: the trail must
-- outlive the customer. NULL for a record that belongs to nobody.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS subject_id UUID;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id UUID
    CONSTRAINT fk_audit_logs_actor REFERENCES users(id) ON DELETE SET NULL;

-- Snapshot (like exception_logs.username): survives the user being deleted.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_username TEXT;

-- When the STAFF acted, from the device clock. NOT the sync moment — that is
-- exactly what makes a DB trigger unusable here. Drives the 30-day window.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_occurred
    ON audit_logs (tenant_id, occurred_at DESC);

-- Serves the per-record History sheet.
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
    ON audit_logs (table_name, record_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
    ON audit_logs (actor_user_id, occurred_at DESC);

-- The offline client's incremental pull cursor (WHERE updated_at > cursor).
CREATE INDEX IF NOT EXISTS idx_audit_logs_updated_at
    ON audit_logs (updated_at);

-- Serves the customer History sheet.
CREATE INDEX IF NOT EXISTS idx_audit_logs_subject
    ON audit_logs (subject_id, occurred_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE skipped_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE exception_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

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
    -- "Create organization" button when AllowSelfServiceSignup = false. No write
    -- policy exists, so only service_role (which bypasses RLS — used by
    -- SuperAdmin and the create-tenant Edge Function) can mutate.
    -- (Drop+create so the role set updates on existing deployments.)
    DROP POLICY IF EXISTS app_options_select ON app_options;
    CREATE POLICY app_options_select ON app_options
        FOR SELECT
        TO anon, authenticated
        USING (TRUE);

    -- ── TENANT SETTINGS ──────────────────────────────────────
    -- Every member of the tenant reads them (they drive shared behavior like
    -- the unpaid rule), but only admins may write.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenant_settings' AND policyname = 'tenant_settings_select'
    ) THEN
        CREATE POLICY tenant_settings_select ON tenant_settings
            FOR SELECT USING (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'tenant_settings' AND policyname = 'tenant_settings_write'
    ) THEN
        CREATE POLICY tenant_settings_write ON tenant_settings
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
            );
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

    -- ── CUSTOMER PLANS (service lines) ───────────────────────
    -- No own branch_id; inherit from the owning customer, exactly like
    -- charges. Tenant-wide users see all; branch-scoped users only see
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

    -- ── CHARGES ──────────────────────────────────────────────
    -- A charge inherits its branch from the owning customer, the way payments
    -- and custom_debts did — so a customer moved to another branch takes their
    -- bills with them. Its own branch_id is consulted ONLY for a walk-in sale
    -- charge, which has no customer to inherit from.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'charges' AND policyname = 'charges_all'
    ) THEN
        CREATE POLICY charges_all ON charges
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = charges.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                    OR (charges.customer_id IS NULL
                        AND charges.branch_id = current_branch_id())
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = charges.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                    OR (charges.customer_id IS NULL
                        AND charges.branch_id = current_branch_id())
                )
            );
    END IF;

    -- ── COLLECTIONS ──────────────────────────────────────────
    -- Same branch rule as charges: via the customer, own branch_id only for a
    -- walk-in sale's cash.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'collections' AND policyname = 'collections_all'
    ) THEN
        CREATE POLICY collections_all ON collections
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = collections.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                    OR (collections.customer_id IS NULL
                        AND collections.branch_id = current_branch_id())
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = collections.customer_id
                          AND c.branch_id = current_branch_id()
                    )
                    OR (collections.customer_id IS NULL
                        AND collections.branch_id = current_branch_id())
                )
            );
    END IF;

    -- ── COLLECTION ITEMS ─────────────────────────────────────
    -- No own branch_id: inherited via the parent collection, exactly like
    -- sale_items inherit via the parent sale.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'collection_items' AND policyname = 'collection_items_all'
    ) THEN
        CREATE POLICY collection_items_all ON collection_items
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM collections co
                    WHERE co.id = collection_items.collection_id
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM collections co
                    WHERE co.id = collection_items.collection_id
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

    -- ── SERVICES ─────────────────────────────────────────────
    -- Identical semantics to products: shared price list (branch_id IS NULL)
    -- visible to everyone in the tenant; branch-specific visible to that
    -- branch + tenant-wide admins. Not admin-only on purpose — a collector
    -- adds a service from the sale form the same way they add a product.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'services' AND policyname = 'services_select'
    ) THEN
        CREATE POLICY services_select ON services
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
        WHERE tablename = 'services' AND policyname = 'services_modify'
    ) THEN
        CREATE POLICY services_modify ON services
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

    -- ── SALE ITEMS ───────────────────────────────────────────
    -- No own branch_id; inherit from the parent sale, exactly like collection_items
    -- inherit from the customer. Tenant-wide users see all; branch-scoped users
    -- only see lines whose parent sale.branch_id matches theirs.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'sale_items' AND policyname = 'sale_items_all'
    ) THEN
        CREATE POLICY sale_items_all ON sale_items
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM sales s
                    WHERE s.id = sale_items.sale_id
                    AND (
                        current_branch_id() IS NULL
                        OR s.branch_id = current_branch_id()
                    )
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM sales s
                    WHERE s.id = sale_items.sale_id
                    AND (
                        current_branch_id() IS NULL
                        OR s.branch_id = current_branch_id()
                    )
                )
            );
    END IF;

    -- ── STOCK MOVEMENTS ──────────────────────────────────────
    -- No own branch_id; inherit from the parent product. Mirrors products_select:
    -- a branch-scoped user reaches their own branch's products AND shared ones.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'stock_movements' AND policyname = 'stock_movements_all'
    ) THEN
        CREATE POLICY stock_movements_all ON stock_movements
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM products p
                    WHERE p.id = stock_movements.product_id
                    AND (
                        current_branch_id() IS NULL
                        OR p.branch_id IS NULL
                        OR p.branch_id = current_branch_id()
                    )
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM products p
                    WHERE p.id = stock_movements.product_id
                    AND (
                        current_branch_id() IS NULL
                        OR p.branch_id IS NULL
                        OR p.branch_id = current_branch_id()
                    )
                )
            );
    END IF;


    -- ── EXPENSES ─────────────────────────────────────────────
    -- ADMINS ONLY, read and write: rent and salaries are not staff business.
    -- Owns its branch_id (the `sales` shape, not the customer-inherited one),
    -- and a NULL branch is a company-wide expense every admin can see.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'expenses' AND policyname = 'expenses_all'
    ) THEN
        CREATE POLICY expenses_all ON expenses
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
                AND (
                    branch_id IS NULL
                    OR current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            )
            WITH CHECK (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
                AND (
                    branch_id IS NULL
                    OR current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- ── SKIPPED MONTHS ───────────────────────────────────────
    -- Same branch-via-customer inheritance as charges / collections.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'skipped_months' AND policyname = 'skipped_months_all'
    ) THEN
        CREATE POLICY skipped_months_all ON skipped_months
            FOR ALL
            USING (
                tenant_id = current_tenant_id()
                AND (
                    current_branch_id() IS NULL
                    OR EXISTS (
                        SELECT 1 FROM customers c
                        WHERE c.id = skipped_months.customer_id
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
                        WHERE c.id = skipped_months.customer_id
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

    -- ── AUDIT LOGS ───────────────────────────────────────────
    -- Read: ADMINS ONLY — the trail exists to settle staff-vs-admin disputes, so
    -- staff must not read it. Branch-aware via the row's own denormalized
    -- branch_id (NULL = a tenant-wide record, visible to every admin).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_select'
    ) THEN
        CREATE POLICY audit_logs_select ON audit_logs
            FOR SELECT
            USING (
                tenant_id = current_tenant_id()
                AND EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid()
                      AND u.role IN ('admin', 'superadmin')
                      AND u.active = true
                )
                AND (
                    branch_id IS NULL
                    OR current_branch_id() IS NULL
                    OR branch_id = current_branch_id()
                )
            );
    END IF;

    -- Write: EVERY tenant member inserts — a staff device must be able to push
    -- its own trail even though it can never read one back.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_insert'
    ) THEN
        CREATE POLICY audit_logs_insert ON audit_logs
            FOR INSERT
            WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    -- No UPDATE and no DELETE policy ON PURPOSE: the trail is append-only from
    -- the client and cannot be edited or erased from the app (same "absence of a
    -- policy = service_role only" idiom as app_options). This is why the sync
    -- pushes audit_logs with ON CONFLICT DO NOTHING — see TableSpec.appendOnly.

END $$;

-- ============================================================
-- PUBLIC RPC: is_tenant_code_available
-- Exposed to the anon role so the public signup flow in SubsTrack
-- can pre-check organization-code availability before walking the user
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

-- 3. LEDGER INTEGRITY (charges + collections + collection_items)
--    A CHARGE is what is owed; a COLLECTION is money handed over; a
--    COLLECTION_ITEM says which charge that money paid. What has been paid is
--    NEVER a column — it is SUM(collection_items), exposed by charge_balances.
--    One bill can take many collections (installments) and one collection can
--    settle many bills (the oldest-first waterfall) — that many-to-many is why
--    the middle table exists.
--    charges.amount is a SNAPSHOT with its own frozen currency + rate. Never
--    recompute it from plan.price or a product price.
--    billing_month MUST be YYYY-MM-01 (chk_charges_billing_month_first_day), and
--    uq_charges_line_month is per SERVICE LINE — a customer with several lines
--    is billed for each independently.
--    A month charge is created LAZILY, only when money first touches the month;
--    an untouched unpaid month has no row and is computed by buildMonthGrid.
--    Voiding a COLLECTION un-applies all its items at once and every balance it
--    touched comes back on its own. Voiding a CHARGE says the bill was a
--    mistake; writing one off says it is real but lost. Nothing is ever deleted.

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
--    charges / collections Inherit from customers.branch_id via JOIN. Their own
--                          branch_id is read ONLY for a customer-less walk-in
--                          sale row, which has nothing to inherit from.
--
--    Single-branch tenants leave branch_id NULL on every row — the feature is invisible.
--    Branch-scoped admins cannot create shared plans (WITH CHECK enforces branch match).

-- ============================================================
-- OFFLINE-FIRST SYNC SUPPORT
-- Server-authoritative updated_at drives the native app's incremental pull
-- (WHERE updated_at > last_pulled_at, latest-updated_at-wins). See docs/offline.md.
-- Placed at the end so every referenced table already exists.
-- ============================================================

-- Server-authoritative updated_at for the tables defined above.
CREATE OR REPLACE TRIGGER trg_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_charges_updated_at
    BEFORE UPDATE ON charges
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_collection_items_updated_at
    BEFORE UPDATE ON collection_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_skipped_months_updated_at
    BEFORE UPDATE ON skipped_months
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_exception_logs_updated_at
    BEFORE UPDATE ON exception_logs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- audit_logs is append-only, so this never actually fires from the app (no
-- UPDATE policy exists). It is here so the pull cursor stays server-authoritative
-- if service_role ever touches a row.
CREATE OR REPLACE TRIGGER trg_audit_logs_updated_at
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- NOTE: no tombstone table/triggers. The native client propagates hard deletes
-- itself: it pushes a real DELETE for locally-removed rows and, on pull, drops
-- any local row that no longer exists on the server (see sync.ts reconcileDeletes).
