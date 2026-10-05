# Supabase Edge Functions

Deno, each at `SubsTrack/supabase/functions/<name>/index.ts`.
- Errors (all): gotcha #40 — invoke errors via `BaseRepository.handleFunctionsError` / `readFunctionsErrorBody`, never raw `handleError`.
- **Every `functions.invoke` site must `await this.ensureFreshSession()` first** — native token refresh is a foreground-only timer → backgrounded app sends expired JWT → 401 `"Auth session missing!"` (gotcha #123).

## `create-user`

- Atomically creates `auth.users` + `public.users`; rolls back `auth.users` if `public.users` insert fails.
- Caller must be admin (JWT); own tenant only; branch-scoped caller → `branch_id` validated + forced to theirs.
- **One JSON log line per event** `{ fn, reqId, event, … }` via `log()`; `reqId` per call ties lines; `client` = `x-client-info` header (phone vs web). Every rejection via `fail()`, which logs status + reason → any 4xx explainable from dashboard logs alone. Passwords never logged (length only).
- Deploy: `yarn deploy-create-user-edge-function` (in `SubsTrack/`).

## `update-user-password`

Sets `auth.users` password via service role; same-tenant + role checks: **own password ALWAYS allowed** (any role); else admins change only staff (`user`); only superadmin changes another admin's. Repos surface its message via `BaseRepository.handleFunctionsError` (#40).

## `create-tenant`

- **Public** (`--no-verify-jwt`); **sole** anon path to create a tenant (app ships anon key only; no INSERT policy on `tenants`/`branches`).
- **Signup gate** first: `app_options.AllowSelfServiceSignup` explicit `'false'` → `403 { error, code: 'signup_disabled' }`; missing/blank = allowed (misconfig must never lock out signup). Server is authoritative; login screen only hides the entry.
- Service role, cascading rollback on any step: 1. `tenants` — `customer_allowance`, `plan_allowance`, `price_per_plan_usd` **omitted on purpose** → schema defaults (30 customers, 30 lines, $0.15/line) decide starting deal in one place; 30 = product floor, self-service tenant born on it. 2. `branches` ('Default Branch'). 3. seed `LBP` (`decimals 0`, symbol `ل.ل`) at `app_options.LiraRate` (fallback `DEFAULT_LIRA_RATE = 89000`). 4. `auth.users`. 5. `public.users` (role = `superadmin`, `branch_id = null`).
- Org signup pre-check: `is_tenant_code_available` SECURITY DEFINER RPC (granted `anon`), boolean only.
- `paymentToken` in body accepted, ignored — hook for paid-plan gating.
- Deploy: `yarn deploy-create-tenant-edge-function` (in `SubsTrack/`). No OTA for edge fns → after per-customer-pricing change, redeploy **before** `script.sql`: safe (insert without dropped `tier_id` works while column has a default); reverse order 500s every signup in between.

Flow: `docs/features.md` → Authentication Flow; anon rationale: gotcha #33.

## `customer-portal`

- **Public** (`--no-verify-jwt`, second after `create-tenant`); a customer has no Supabase account and never may.
- **`--no-verify-jwt` ≠ no key.** Gateway returns `401 UNAUTHORIZED_NO_AUTH_HEADER` before code runs to any call without `apikey` or `Authorization`; `verify_jwt = false` only skips checking *claims*. Portal sends project **anon key** every call (as `supabase.functions.invoke()` does for `create-tenant`). CORS **preflight exempt** → `OPTIONS` arrives unauthenticated; `Access-Control-Allow-Headers` must list `authorization, apikey, content-type`. Symptom: 401 body `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` — looks like bad password, never touched DB.
- **Only customer boundary.** No DB rule narrows to one customer: every RLS policy is `tenant_id = current_tenant_id()` off a STAFF jwt; `current_branch_id()` = NULL for anyone not in `public.users` = *tenant-wide admin* to every policy. So service role + scoping in code: every query filters on `customerId`/`tenantId` from the **verified token**, never body.
- One endpoint: `{ action: "login", customerId, password }` → `{ token }`; `{ action: "data", token }` → whole read model.
- **Same 401 for wrong password, unknown customer, disabled portal, inactive tenant** — link is a bare customer id; any difference confirms existence.
- `token` = stateless HS256 JWT (`jose`), `PORTAL_JWT_SECRET` (`supabase secrets set` or Dashboard → Project Settings → Edge Functions → Secrets), `sub` = customer id, 30-day expiry, no sessions table.
- **Unset `PORTAL_JWT_SECRET` hides until first CORRECT password** (wrong ones → `bad_credentials`; secret read only to sign) → 500 only on success. Function now checks `SUPABASE_URL`, `SERVICE_ROLE_KEY`, `PORTAL_JWT_SECRET` up front → `not_configured` naming missing ones, not `server_error`.
- Brute force: `customer_portal_lockouts` (10 fails / 15 min → locked 15 min); RLS on, **no policy** (service role only); deliberately NOT in SQLite mirror or `PUSH_WAVES` — a failed-login counter must never enter sync.
- Response = **raw snake_case `Db*` rows** (function = portal's DB), mapped by SubsTrack's own mappers. Forbidden columns (`notes`, `location_url`, custody, void reasons) **nulled, not omitted** → still valid `Db*`.
- Deploy: `cd Portal && npm run deploy-function`. **Script in `Portal/package.json`, not `SubsTrack/package.json`** — its `scripts` feed OTA fingerprint; adding there stops every installed phone updating (gotcha #53).

## `customer-status`

Web customer list's **exact** status over every in-scope customer (10k+), one page at a time (phone list judges only what it scrolled to).
- **Staff only, runs as CALLER**: `verify_jwt = true`; reads use a client from caller's `Authorization` + `ANON_KEY` → RLS scopes tenant + branch like phone. No service role, no added privilege. Secrets: `ANON_KEY` (+ built-in `SUPABASE_URL`).
- **Body** `CustomerStatusRequest` `{ search, filters, sort, branch, offset, limit, today }`: `filters` = `CustomerFilterQuery` (`customerFilters.ts`: status, payment, debt, planId, unpaidMonths, type, phone, portal, last-paid window `paidSinceIso` / `paidBeforeIso` = INSTANTS from caller's local days, b/c server is UTC); `sort` = `CustomerSort` (default `"name"`); `limit` 1–100 (free Data Grid page cap); `branch` = Shared `BranchFilter` (`null` / id / `"unassigned"`); `today` = caller's `YYYY-MM-DD`. Pure `parseCustomerStatusRequest` checks all before any read → `400 { error, code: "invalid_request" }`.
- **Answer** `CustomerStatusResponse` `{ rows: [{ customer, status, debtUsd }], total }`: `customer` = raw `DbCustomer` w/ `customer_plans(*, plans(*))` (`CUSTOMER_WITH_LINES_SELECT`), mapped in `CustomerService.getCustomerStatusPage`; `total` = all matching search + filters. No per-tab counts (tabs → dropdowns).
- **Three reads, then pure code.** (1) `customer_status_facts(p_branch_id, p_unassigned)` (SQL, `SECURITY INVOKER`) → ONE `json` of positional arrays: customers (… `is_regular, portal_enabled, created_at, last_paid_at` — from `customer_last_paid()`, newest live hand-over of any kind), lines (live month bills `[billing_month, duration_months, amount, paid]`, skipped months, then `plan_id`), open bills `[customer_id, kind, balance, paid, rate]` — so PostgREST's 1000-row cap never cuts it (gotcha #170); decides **no** rule. (2) `tenant_settings` → unpaid rule. Then `customerStatusPage()` (Shared) decodes, runs `getCustomerStatuses` → `matchesCustomerFilters` on caller's day (`onCalendarDay`, gotcha #173), searches name / phone / address / area (any case), sorts (`CustomerSort`, ties name then id; never-paid = longest unpaid), slices. Tuples only grow at the END; `readCustomerStatusFacts` defaults a missing tail → new bundle reads older `customer_status_facts()`. (3) page's full customer rows by id.
- **Shared code bundled, not copied** (Deno can't read `@shared/*`): `Web/scripts/build-edge.mjs` (Vite lib build) → `customer-status/_generated/{customerStatus,customerSelect}.js`, **committed** (comments stripped, ~18 KB) so a fresh clone deploys with plain CLI, no Web `npm install`; build **fails** if Shared code imports an npm package (no i18n, no supabase-js). Rebuild + redeploy on any change to `monthStatus.ts`, `customerFilters.ts`, `customerStatusPage.ts` or their imports — stale bundle → web filters disagree w/ phone (old function answers new body "Unknown customer tab.").
- **Debt** = phone's `fetchNetByCustomer()` (no branch filter on bills): every open, not-written-off bill of an in-scope customer via `isDebtItem` + `balanceUsd` (`ledger/utils/debtRule.ts`); fully unpaid month = owed, not debt.
- **Phone:** `OfflineCustomerStatusRepository` online-only delegate (`RequiresConnectionError` offline); phone list doesn't call it yet.
- **Logs:** one `served` line/call: `readMs` / `computeMs` / `totalMs` + fact sizes (speed numbers live in dashboard logs).
- **Speed test** (TEST project only; scripts refuse the shipped URL + a non-empty org): new empty org on TEST, `Web/.env.speed.local` w/ `SPEED_SUPABASE_URL`, `SPEED_SUPABASE_ANON_KEY`, `SPEED_TENANT_CODE`, `SPEED_USERNAME`, `SPEED_PASSWORD` (owner) → `cd Web && node scripts/status-speed/seed.mjs --customers 10000 --yes-this-is-the-test-project` → `node scripts/status-speed/measure.mjs`; slowest median < 1500 ms = pass; 50k on a 2nd empty org, no target.
- **Deploy** (after `script.sql`, calls `customer_status_facts`) — two ways, same code:
  - **CLI**: `cd SubsTrack && supabase functions deploy customer-status` (uses committed bundle), or `cd Web && npm run deploy-customer-status` (rebuild + deploy). Script in `Web/package.json`, never `SubsTrack/package.json` (gotcha #53).
  - **Dashboard** (dev laptop has no CLI, `npx` AV-blocked): `cd Web && npm run build-edge` also writes self-contained `functions/_dashboard/customer-status/index.ts` (function + Shared; only esm.sh import left; git-ignored; OUTSIDE the function folder so CLI never sees a 2nd `Deno.serve`) → paste into Dashboard → Edge Functions → Deploy a new function → Via Editor (name `customer-status`, "Verify JWT" ON).
  - Any change to month rules → `npm run build-edge` + **commit `_generated/`** (else the other machine deploys the old bundle) + redeploy.

## `whatsapp-*` (WhatsApp Cloud API)

Five functions + first `_shared/` folder (`_shared/whatsapp/`); design: `docs/whatsapp.md`.
- **Staff:** `whatsapp-admin`, `whatsapp-send` keep JWT verify; caller via `requireAdmin`, which **does** check `users.active`, tenant active, `tenants.whatsapp_enabled`; tenant from `users` row, never body.
- **Public** (`verify_jwt = false`): `whatsapp-onboard` (one-time session token), `whatsapp-worker` (`x-worker-secret`, pg_cron via Vault), `whatsapp-webhook` (Meta HMAC over raw body).
- **Errors** `{ error, code }`; app maps `code` → `whatsapp.errors.<code>` via `WhatsAppError`, server text fallback. Meta refusal = 502 `code: "meta_error"` + Meta's message.
- **Deploy:** `yarn deploy-whatsapp-functions` (in `SubsTrack/`); adding it changed OTA fingerprint → shipped w/ new native build (gotcha #53).
- **Gateway key rule applies.** Meta sends no headers → webhook URL carries `?apikey=<anon key>`. pg_cron → `whatsapp-worker` sends `apikey` header from Vault secret `whatsapp_worker_apikey`; without it every run = silent 401, queue never drains.
- The existing five functions keep their own copied `corsHeaders`/`log`/`fail`; moving them to `_shared/` = separate change.
