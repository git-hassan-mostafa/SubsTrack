-- ============================================================
-- RESET SCRIPT
-- Drops all objects created by script.sql.
-- Run this first, then run script.sql to recreate everything.
-- ============================================================

-- ── TRIGGERS ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tier_plans_updated_at ON tier_plans;
DROP TRIGGER IF EXISTS trg_customers_updated_at  ON customers;
DROP TRIGGER IF EXISTS trg_currencies_updated_at ON currencies;
DROP TRIGGER IF EXISTS trg_branches_updated_at   ON branches;
DROP TRIGGER IF EXISTS trg_products_updated_at   ON products;

-- ── RLS POLICIES ─────────────────────────────────────────────
DROP POLICY IF EXISTS sales_all         ON sales;
DROP POLICY IF EXISTS products_modify   ON products;
DROP POLICY IF EXISTS products_select   ON products;
DROP POLICY IF EXISTS payments_all      ON payments;
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
DROP POLICY IF EXISTS tenants_select    ON tenants;
DROP POLICY IF EXISTS tenants_update    ON tenants;

-- ── TABLES (reverse FK order) ─────────────────────────────────
DROP TABLE IF EXISTS sales      CASCADE;
DROP TABLE IF EXISTS payments   CASCADE;
DROP TABLE IF EXISTS customers  CASCADE;
DROP TABLE IF EXISTS products   CASCADE;
DROP TABLE IF EXISTS plans      CASCADE;
DROP TABLE IF EXISTS users      CASCADE;
DROP TABLE IF EXISTS branches   CASCADE;
DROP TABLE IF EXISTS currencies CASCADE;
DROP TABLE IF EXISTS tenants    CASCADE;
DROP TABLE IF EXISTS tier_plans CASCADE;

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
