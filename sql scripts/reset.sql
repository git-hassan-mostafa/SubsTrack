-- ============================================================
-- RESET SCRIPT
-- Drops all objects created by script.sql.
-- Run this first, then run script.sql to recreate everything.
-- ============================================================

-- ── TRIGGERS ─────────────────────────────────────────────────
-- One per table carrying updated_at. The DROP TABLE ... CASCADE below would
-- sweep these anyway; listed for clarity and for a partial reset.
DROP TRIGGER IF EXISTS trg_tier_plans_updated_at ON tier_plans;
DROP TRIGGER IF EXISTS trg_tenants_updated_at    ON tenants;
DROP TRIGGER IF EXISTS trg_customers_updated_at  ON customers;
DROP TRIGGER IF EXISTS trg_customer_plans_updated_at ON customer_plans;
DROP TRIGGER IF EXISTS trg_currencies_updated_at ON currencies;
DROP TRIGGER IF EXISTS trg_branches_updated_at   ON branches;
DROP TRIGGER IF EXISTS trg_users_updated_at      ON users;
DROP TRIGGER IF EXISTS trg_plans_updated_at      ON plans;
DROP TRIGGER IF EXISTS trg_payments_updated_at   ON payments;
DROP TRIGGER IF EXISTS trg_products_updated_at   ON products;
DROP TRIGGER IF EXISTS trg_sales_updated_at      ON sales;
DROP TRIGGER IF EXISTS trg_sale_items_updated_at ON sale_items;
DROP TRIGGER IF EXISTS trg_stock_movements_updated_at ON stock_movements;
DROP TRIGGER IF EXISTS trg_custom_debts_updated_at ON custom_debts;
DROP TRIGGER IF EXISTS trg_debt_payments_updated_at ON debt_payments;
DROP TRIGGER IF EXISTS trg_skipped_months_updated_at ON skipped_months;
DROP TRIGGER IF EXISTS trg_exception_logs_updated_at ON exception_logs;
DROP TRIGGER IF EXISTS trg_audit_logs_updated_at ON audit_logs;
DROP TRIGGER IF EXISTS trg_app_options_updated_at ON app_options;
DROP TRIGGER IF EXISTS trg_tenant_settings_updated_at ON tenant_settings;

-- ── VIEWS ────────────────────────────────────────────────────
DROP VIEW IF EXISTS product_stock;

-- ── RLS POLICIES ─────────────────────────────────────────────
DROP POLICY IF EXISTS audit_logs_select  ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert  ON audit_logs;
DROP POLICY IF EXISTS exception_logs_all ON exception_logs;
DROP POLICY IF EXISTS skipped_months_all ON skipped_months;
DROP POLICY IF EXISTS debt_payments_all  ON debt_payments;
DROP POLICY IF EXISTS custom_debts_all   ON custom_debts;
DROP POLICY IF EXISTS sale_items_all     ON sale_items;
DROP POLICY IF EXISTS stock_movements_all ON stock_movements;
DROP POLICY IF EXISTS sales_all         ON sales;
DROP POLICY IF EXISTS products_modify   ON products;
DROP POLICY IF EXISTS products_select   ON products;
DROP POLICY IF EXISTS payments_all      ON payments;
DROP POLICY IF EXISTS customer_plans_all ON customer_plans;
DROP POLICY IF EXISTS customers_all     ON customers;
DROP POLICY IF EXISTS plans_modify      ON plans;
DROP POLICY IF EXISTS plans_select      ON plans;
DROP POLICY IF EXISTS plans_all         ON plans;
DROP POLICY IF EXISTS currencies_all    ON currencies;
DROP POLICY IF EXISTS branches_all      ON branches;
DROP POLICY IF EXISTS users_update      ON users;
DROP POLICY IF EXISTS users_insert      ON users;
DROP POLICY IF EXISTS users_select      ON users;
DROP POLICY IF EXISTS tier_plans_select ON tier_plans;
DROP POLICY IF EXISTS app_options_select ON app_options;
DROP POLICY IF EXISTS tenant_settings_write  ON tenant_settings;
DROP POLICY IF EXISTS tenant_settings_select ON tenant_settings;
DROP POLICY IF EXISTS tenants_select    ON tenants;
DROP POLICY IF EXISTS tenants_update    ON tenants;

-- ── TABLES (reverse FK order) ─────────────────────────────────
DROP TABLE IF EXISTS audit_logs     CASCADE;
DROP TABLE IF EXISTS exception_logs CASCADE;
DROP TABLE IF EXISTS skipped_months CASCADE;
DROP TABLE IF EXISTS debt_payments  CASCADE;
DROP TABLE IF EXISTS custom_debts   CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales      CASCADE;
DROP TABLE IF EXISTS payments   CASCADE;
DROP TABLE IF EXISTS customer_plans CASCADE;
DROP TABLE IF EXISTS customers  CASCADE;
DROP TABLE IF EXISTS products   CASCADE;
DROP TABLE IF EXISTS plans      CASCADE;
DROP TABLE IF EXISTS users      CASCADE;
DROP TABLE IF EXISTS branches   CASCADE;
DROP TABLE IF EXISTS currencies CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS tenants     CASCADE;
DROP TABLE IF EXISTS tier_plans  CASCADE;
DROP TABLE IF EXISTS app_options CASCADE;

-- ── FUNCTIONS ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS public.is_tenant_code_available(TEXT);
DROP FUNCTION IF EXISTS public.get_free_tier_id();
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.current_tenant_id();
DROP FUNCTION IF EXISTS public.current_branch_id();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- ── AUTH USERS ───────────────────────────────────────────────
-- Deletes all Supabase auth users (login accounts).
-- The auth schema itself is managed by Supabase and cannot be dropped.
-- NOTE: Before running this, disable the custom access token hook in:
--       Dashboard → Authentication → Hooks → "Customize access token (JWT) claims"
DELETE FROM auth.users;
