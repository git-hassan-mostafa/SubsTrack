-- ============================================================
-- RESET SCRIPT
-- Drops all objects created by script.sql.
-- Run this first, then run script.sql to recreate everything.
-- ============================================================

-- ── TRIGGERS ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;

-- ── RLS POLICIES ─────────────────────────────────────────────
DROP POLICY IF EXISTS payments_all   ON payments;
DROP POLICY IF EXISTS customers_all  ON customers;
DROP POLICY IF EXISTS plans_all      ON plans;
DROP POLICY IF EXISTS users_update   ON users;
DROP POLICY IF EXISTS users_insert   ON users;
DROP POLICY IF EXISTS users_select   ON users;
DROP POLICY IF EXISTS saas_tiers_select ON saas_tiers;
DROP POLICY IF EXISTS tenants_select ON tenants;

-- ── TABLES (reverse FK order) ─────────────────────────────────
DROP TABLE IF EXISTS payments   CASCADE;
DROP TABLE IF EXISTS customers  CASCADE;
DROP TABLE IF EXISTS plans      CASCADE;
DROP TABLE IF EXISTS users      CASCADE;
DROP TABLE IF EXISTS saas_tiers CASCADE;
DROP TABLE IF EXISTS tenants    CASCADE;

-- ── FUNCTIONS ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS public.current_user_role();
DROP FUNCTION IF EXISTS public.current_tenant_id();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- ── AUTH USERS ───────────────────────────────────────────────
-- Deletes all Supabase auth users (login accounts).
-- The auth schema itself is managed by Supabase and cannot be dropped.
-- NOTE: Before running this, disable the custom access token hook in:
--       Dashboard → Authentication → Hooks → "Customize access token (JWT) claims"
DELETE FROM auth.users;
