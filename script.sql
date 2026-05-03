-- =========================
-- EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- TENANTS
-- =========================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_id ON tenants(id);


-- =========================
-- TENANTS Plans
-- =========================

CREATE TABLE IF NOT EXISTS tenant_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name TEXT NOT NULL,

    max_users INT NOT NULL,
    max_customers INT NOT NULL,

    price NUMERIC(12,2) NOT NULL,

    tenant_id UUID NOT NULL UNIQUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_tenant_plans_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

-- =========================
-- USERS (APP-LEVEL)
-- =========================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL,
    phone_number TEXT,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
    tenant_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_tenant
ON users(username, tenant_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- =========================
-- PLANS
-- =========================
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    price NUMERIC(12,2),
    is_custom_price BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_plans_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_name_tenant
ON plans(name, tenant_id);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_id ON plans(tenant_id);

-- =========================
-- CUSTOMERS
-- =========================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone_number TEXT,
    address TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    plan_id UUID,
    tenant_id UUID NOT NULL,
    start_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_customers_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_customers_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_plan_id ON customers(plan_id);

-- =========================
-- PAYMENTS
-- =========================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    billing_month DATE NOT NULL, -- MUST be first day of month
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),

    customer_id UUID NOT NULL,
    plan_id UUID,
    received_by_user_id UUID,
    tenant_id UUID NOT NULL,

    paid_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_payments_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_payments_plan
        FOREIGN KEY (plan_id)
        REFERENCES plans(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_payments_user
        FOREIGN KEY (received_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_payments_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE
);

-- Prevent duplicate payment per customer per month
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_customer_month
ON payments(customer_id, billing_month);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_month ON payments(billing_month);

-- =========================
-- ROW LEVEL SECURITY (RLS)
-- =========================

-- Enable RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- =========================
-- HELPER: get current tenant from JWT
-- =========================
-- Assumes you store tenant_id in auth.jwt() -> 'tenant_id'

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$ LANGUAGE SQL STABLE;

-- =========================
-- POLICIES (basic, can refine later)
-- =========================

-- TENANTS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'tenants'
        AND policyname = 'tenant_isolation_select'
    ) THEN
        CREATE POLICY tenant_isolation_select
        ON tenants
        FOR SELECT
        USING (id = current_tenant_id());
    END IF;

-- USERS
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'users'
        AND policyname = 'users_select'
    ) THEN
        CREATE POLICY users_select
        ON users
        FOR SELECT
        USING (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'users'
        AND policyname = 'users_insert'
    ) THEN
        CREATE POLICY users_insert
        ON users
        FOR INSERT
        WITH CHECK (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'users'
        AND policyname = 'users_update'
    ) THEN
        CREATE POLICY users_update
        ON users
        FOR UPDATE
        USING (tenant_id = current_tenant_id());
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'plans'
        AND policyname = 'plans_all'
    ) THEN
        CREATE POLICY plans_all
        ON plans
        FOR ALL
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    END IF;

-- CUSTOMERS
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'customers'
        AND policyname = 'customers_all'
    ) THEN
        CREATE POLICY customers_all
        ON customers
        FOR ALL
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    END IF;

-- PAYMENTS
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'payments'
        AND policyname = 'payments_all'
    ) THEN
        CREATE POLICY payments_all
        ON payments
        FOR ALL
        USING (tenant_id = current_tenant_id())
        WITH CHECK (tenant_id = current_tenant_id());
    END IF;
END$$;

-- =========================
-- IMPORTANT NOTES (READ)
-- =========================

-- 1. billing_month MUST always be normalized to first day of month (YYYY-MM-01)
-- 2. amount is a SNAPSHOT (never recomputed)
-- 3. tenant_id MUST be injected from authenticated user
-- 4. NEVER bypass RLS in production