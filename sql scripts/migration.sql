-- ============================================================
-- MIGRATION — ONE-TIME STATEMENTS, EXISTING DATABASES ONLY
--
-- script.sql is the full schema and is re-runnable on any database, fresh or
-- live. It can only ADD. Anything that DROPS, RENAMES, RETYPES or REWRITES
-- EXISTING ROWS lives here instead, because a fresh database has nothing to
-- drop and no rows to fix.
--
-- ORDER: run this file FIRST, then script.sql. Several entries below clear the
-- way for a constraint or a function signature that script.sql then declares.
--
-- Each entry is guarded, so re-running it is a no-op — but it is still meant to
-- be run ONCE, and it may be deleted from this file after every database has
-- had it.
-- ============================================================


-- ------------------------------------------------------------
-- 2026-09-17 — Per-service-line billing (two allowances)
-- Billing moved from ACTIVE CUSTOMERS to ACTIVE SERVICE LINES.
-- tenants gains plan_allowance + price_per_plan_usd (script.sql),
-- customer_requests gains requested_plans + granted_plans (script.sql),
-- accept_customer_request and lower_allowances change signature (script.sql).
-- Everything below is the live-database half of that change.
-- ------------------------------------------------------------

-- 1. Lift every tenant over the new floor BEFORE script.sql adds
--    chk_tenants_plan_allowance_floor, or the constraint is refused on any
--    tenant whose customer_allowance or live line count is above the default 30.
--
--    The column has to EXIST before it can be filled, and script.sql declares it
--    and the constraint in the same pass — so the ADD is repeated here, byte for
--    byte. Both are IF NOT EXISTS, so whichever file runs first wins and the
--    other is a no-op. script.sql stays the declaration of record.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_allowance INT NOT NULL DEFAULT 30;

UPDATE tenants t
SET plan_allowance = GREATEST(
        t.plan_allowance,
        t.customer_allowance,
        (SELECT COUNT(*) FROM customer_plans p
           JOIN customers c ON c.id = p.customer_id
          WHERE p.tenant_id = t.id AND p.active AND c.active));

-- 2. Carry the old per-customer rate over to the per-line column, then drop it.
--    The rate is unchanged, only what it is charged per. Same repeated ADD as
--    above, and it carries its CHECK so a live database gets that too.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_per_plan_usd NUMERIC(10,4) NOT NULL DEFAULT 0.15
    CONSTRAINT chk_tenants_price_per_plan CHECK (price_per_plan_usd >= 0);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tenants'
          AND column_name = 'price_per_customer_usd'
    ) THEN
        UPDATE tenants SET price_per_plan_usd = price_per_customer_usd;
        ALTER TABLE tenants DROP COLUMN price_per_customer_usd;
    END IF;
END $$;

-- 3. The ten-row minimum used to sit on requested_count alone, which refuses a
--    request asking only for more service lines. script.sql declares the
--    replacement (chk_customer_requests_total_min); the old one goes here.
--
--    Dropping it would leave requested_count with no check of its own on a live
--    database, because the column already exists and script.sql's ADD COLUMN —
--    which carries chk_customer_requests_count and the new DEFAULT — is a no-op
--    there. The total minimum does not imply a non-negative half: -5 customers
--    and +20 lines would pass it. So both ride along here.
ALTER TABLE customer_requests DROP CONSTRAINT IF EXISTS chk_customer_requests_min;
ALTER TABLE customer_requests ALTER COLUMN requested_count SET DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_customer_requests_count'
    ) THEN
        ALTER TABLE customer_requests ADD CONSTRAINT chk_customer_requests_count
            CHECK (requested_count >= 0);
    END IF;
END $$;

-- 4. Old function signatures. Postgres keeps an overload alive, so the
--    two-argument accept_customer_request would go on answering next to the
--    three-argument one, and lower_customer_allowance next to lower_allowances.
--    Dropped by exact signature, never CASCADE.
DROP FUNCTION IF EXISTS accept_customer_request(UUID, INT);
DROP FUNCTION IF EXISTS lower_customer_allowance(INT);


-- ---------------------------------------------------------------------------
-- 2026-09-22 — charge_balances gains `down_paid`
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW may append a column only to a view it can re-create
-- with the SAME leading column list; appending to a view the database already
-- holds still fails with "cannot change name of view column". So the view is
-- dropped first and script.sql re-creates it with the new column.
--
-- Safe to run repeatedly: script.sql immediately re-creates the view, and it
-- runs AFTER this file. Nothing reads the view in between.
--
-- A fresh database never needs this — script.sql builds the view with the
-- column already on it.
DROP VIEW IF EXISTS charge_balances;
