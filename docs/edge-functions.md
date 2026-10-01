# Supabase Edge Functions

> Deno-runtime functions under `SubsTrack/supabase/functions/`. Referenced from `CLAUDE.md`.
> Error handling for ALL of these is governed by gotcha #40 in `docs/gotchas.md` — invoke errors must go through `BaseRepository.handleFunctionsError` / `readFunctionsErrorBody`, never raw `handleError`.
> **Every `functions.invoke` call site must `await this.ensureFreshSession()` first** — on native the token refresh is a foreground-only timer, so a backgrounded app sends an expired JWT and the function answers 401 `"Auth session missing!"`. See gotcha #123.

## `create-user`

Located at `SubsTrack/supabase/functions/create-user/index.ts`.

- Atomically creates both `auth.users` and `public.users` rows.
- Verifies caller is an admin via their JWT.
- Enforces tenant isolation — admin can only create users in their own tenant.
- For branch-scoped callers, validates and forces `branch_id` to the caller's branch.
- Rolls back the `auth.users` entry if `public.users` insert fails.
- **Logs one structured JSON line per event** — `{ fn, reqId, event, … }` through its `log()` helper, with a per-call `reqId` tying the lines of one request together and `client` (the `x-client-info` header) telling a phone call from a web one. Every rejection goes through `fail()`, which logs the status + reason before returning it, so a 4xx is always explainable from the dashboard logs alone. Passwords are never logged (only their length).
- Deploy: `yarn deploy-create-user-edge-function` (from inside `SubsTrack/`).

## `update-user-password`

Located at `SubsTrack/supabase/functions/update-user-password/index.ts`.

- Admin-capable edge function: changes a user's `auth.users` password via the service role.
- Enforces same-tenant + role checks:
  - **Self-service is ALWAYS allowed** — a caller can change their OWN password regardless of role.
  - Otherwise, admins may change only staff (`user`) passwords.
  - Only a superadmin may change another admin's password.
- Repos surface its real message via `BaseRepository.handleFunctionsError` (see gotcha #40).

## `create-tenant`

Located at `SubsTrack/supabase/functions/create-tenant/index.ts`.

- **Public** edge function — deployed with `--no-verify-jwt` (no JWT required). The **sole** anon-accessible path for creating a tenant (the app ships only the anon key, and there is no INSERT policy on `tenants`/`branches`).
- **Signup gate:** before any work, reads `app_options.AllowSelfServiceSignup`; an explicit `'false'` returns `403 { error, code: 'signup_disabled' }`. A missing/blank row defaults to allowed (a misconfigured option must never lock out signup). This is the authoritative enforcement — the login screen also hides the entry point, but the server is the source of truth.
- Uses the service-role key to perform the full sequence with cascading rollback on any step:
  1. `tenants` — `customer_allowance`, `plan_allowance` and `price_per_plan_usd` are **omitted on purpose** so the schema defaults (30 customers, 30 service lines, at $0.15 per line) decide the starting deal in exactly one place. 30 is also the product floor, so a self-service tenant is born exactly on it.
  2. `branches` ('Default Branch').
  3. Auto-seed an `LBP` currency (`decimals 0`, symbol `ل.ل`) using `app_options.LiraRate` (fallback `DEFAULT_LIRA_RATE = 89000`).
  4. `auth.users`.
  5. `public.users` (role = `superadmin`, `branch_id = null`).
- The pre-check on the organization signup screen uses the `is_tenant_code_available` SECURITY DEFINER RPC (granted to `anon`) — returns a boolean only, no row data.
- Accepts (but currently ignores) a `paymentToken` field in the request body — the hook point for future paid-plan gating.
- Deploy: `yarn deploy-create-tenant-edge-function` (from inside `SubsTrack/`). An edge function does **not** ship over OTA, so after the per-customer-pricing change it must be redeployed **before** `script.sql` runs — deploying first is safe (an insert without the dropped `tier_id` still works while the column has a default), the reverse order 500s every signup in between.

See `docs/features.md` → Authentication Flow for how signup drives this, and gotcha #33 for the full anon-path rationale.

## `customer-portal`

Located at `SubsTrack/supabase/functions/customer-portal/index.ts`.

- **Public** edge function — deployed with `--no-verify-jwt` (the second one, after `create-tenant`). A customer has no Supabase account and must never hold one.
- **`--no-verify-jwt` does NOT mean "no key needed".** The Supabase gateway answers `401 UNAUTHORIZED_NO_AUTH_HEADER` — before the function's code runs at all — to any call that carries neither `apikey` nor `Authorization`. `verify_jwt = false` only stops the token's *claims* being checked. So the portal sends the project **anon key** on every call, exactly as `supabase.functions.invoke()` does for `create-tenant`. The CORS **preflight is exempt**, so `OPTIONS` reaches the function unauthenticated and the function's own `Access-Control-Allow-Headers` must list `authorization, apikey, content-type`. Symptom when this is missed: the browser sends the request and gets a 401 whose body is `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`, which looks like a bad password but never touched the database.
- **It is the only customer boundary that exists.** Nothing in the database narrows a read to a single customer: every RLS policy is `tenant_id = current_tenant_id()` off a STAFF jwt, and `current_branch_id()` returns NULL for anyone absent from `public.users` — which every policy reads as *tenant-wide admin*. So the function holds the service role and does the scoping in code. Every query filters on the `customerId`/`tenantId` decoded from the **verified token**, never on anything in the request body.
- Two actions on one endpoint: `{ action: "login", customerId, password }` → `{ token }`, and `{ action: "data", token }` → the whole read model in one response.
- **Login answers the same 401 for a wrong password, an unknown customer, a disabled portal and an inactive tenant.** The link is a bare customer id, so any difference between them would confirm that a given customer exists.
- `token` is a stateless HS256 JWT (`jose`) signed with `PORTAL_JWT_SECRET` (`supabase secrets set`, or Dashboard → Project Settings → Edge Functions → Secrets), `sub` = customer id, 30-day expiry. No sessions table.
- **An unset `PORTAL_JWT_SECRET` hides until the first CORRECT password.** Every wrong one answers `bad_credentials` normally, because the secret is only read when a token is signed — so the symptom is a 500 that appears only once the login actually succeeds. The function now checks `SUPABASE_URL`, `SERVICE_ROLE_KEY` and `PORTAL_JWT_SECRET` up front and answers `not_configured` naming the missing ones, rather than a generic `server_error`.
- Brute force is throttled by `customer_portal_lockouts` (10 failures in 15 min → locked 15 min). That table has RLS on and **no policy at all** — service-role only — and is deliberately absent from the SQLite mirror and `PUSH_WAVES`: a failed-login counter must never enter the sync engine.
- The response is **raw snake_case `Db*` rows**, because this function is the portal's database; the portal maps them with SubsTrack's own mappers. Columns a customer must not read (`notes`, `location_url`, custody, void reasons) are **nulled, not omitted**, so the row stays a valid `Db*` shape.
- Deploy: `cd Portal && npm run deploy-function`. **The deploy script deliberately lives in `Portal/package.json`, not `SubsTrack/package.json`** — that file's `scripts` block feeds the OTA fingerprint, so adding one there would stop every installed phone receiving updates (gotcha #53).

## `customer-status`

Located at `SubsTrack/supabase/functions/customer-status/index.ts`. The web customer list's **exact** status tabs over every customer in scope (10k+), one page at a time — the phone list only judges the customers it has scrolled to.

- **Staff only, runs as the CALLER.** `verify_jwt = true`; every read uses a client built from the caller's own `Authorization` header + `ANON_KEY`, so RLS scopes it to their tenant and branch exactly like the phone's own reads. It never holds the service role and adds no privilege. Secrets: the existing `ANON_KEY` (and the built-in `SUPABASE_URL`).
- **Body** (`CustomerStatusRequest`): `{ search, filters, sort, branch, offset, limit, today }`. `filters` is a `CustomerFilterQuery` (`customerFilters.ts`: status, payment, debt, planId, unpaidMonths, type, phone, portal, and the last-paid window as `paidSinceIso` / `paidBeforeIso` — INSTANTS the caller made from its own local days, because the server runs in UTC), `sort` a `CustomerSort` (default `"name"`), `limit` 1–100 (the free Data Grid's page cap), `branch` = the Shared `BranchFilter` (`null` / a branch id / `"unassigned"`), `today` = the caller's own `YYYY-MM-DD`. Everything is checked by the pure `parseCustomerStatusRequest` before any read; a refusal is `400 { error, code: "invalid_request" }`.
- **Answer** (`CustomerStatusResponse`): `{ rows: [{ customer, status, debtUsd }], total }`. `customer` is the raw `DbCustomer` with `customer_plans(*, plans(*))` (`CUSTOMER_WITH_LINES_SELECT`), mapped in `CustomerService.getCustomerStatusPage`. `total` is every customer matching the search + filters. There are no per-tab counts any more (the tabs became dropdowns).
- **Three reads, then pure code.** `customer_status_facts(p_branch_id, p_unassigned)` (SQL, `SECURITY INVOKER`) returns ONE `json` value — positional arrays of customers (… `is_regular, portal_enabled, created_at, last_paid_at` — the last from `customer_last_paid()`, the newest live hand-over of any kind), lines (each with its live month bills `[billing_month, duration_months, amount, paid]`, skipped months, then `plan_id`) and open bills `[customer_id, kind, balance, paid, rate]` — so PostgREST's 1000-row cap never cuts it (gotcha #170). It decides **no** rule. `tenant_settings` gives the unpaid rule. Then `customerStatusPage()` (Shared) decodes the facts, runs `getCustomerStatuses` → `matchesCustomerFilters` on the caller's day (`onCalendarDay`, gotcha #173), searches (name / phone / address / area, any case), sorts (the picked `CustomerSort`, every tie by name then id; a never-paid customer is the longest unpaid) and slices the page. The wire tuples only ever grow at the END, and `readCustomerStatusFacts` defaults a missing tail, so a new bundle still reads an older `customer_status_facts()`. Last, the page's full customer rows are read by id.
- **The Shared code is bundled, not copied.** Deno cannot read `@shared/*`, so `Web/scripts/build-edge.mjs` (a Vite library build) writes `customer-status/_generated/{customerStatus,customerSelect}.js` — git-ignored, ~17 KB, and the build **fails** if the Shared code ever imports an npm package (no i18n, no supabase-js inside). Rebuild it whenever `monthStatus.ts`, `customerFilters.ts`, `customerStatusPage.ts` or anything they import changes, then redeploy — a stale bundle means the web filters disagree with the phone (an old deployed function answers the new body with "Unknown customer tab.").
- **Debt** matches the phone list's own `fetchNetByCustomer()` (no branch filter on the bills): every open, not-written-off bill of a customer in scope, through `isDebtItem` and `balanceUsd` (`ledger/utils/debtRule.ts`) — a fully unpaid month is owed, not debt.
- **Phone:** `OfflineCustomerStatusRepository` is an online-only delegate (`RequiresConnectionError` offline). The phone list does not call it yet.
- **Logs:** one `served` line per call with `readMs` / `computeMs` / `totalMs` and the fact sizes — the speed numbers live in the dashboard logs.
- **Speed test** (TEST project only): `QA/web/customer-status.md` — `Web/scripts/status-speed/seed.mjs` then `measure.mjs`. Target: under ~1.5 s at 10k customers.
- **Deploy:** `cd Web && npm run deploy-customer-status` (bundle, then `supabase functions deploy customer-status`), and `script.sql` must have been run first (the function calls `customer_status_facts`). The script lives in `Web/package.json`, never `SubsTrack/package.json` (gotcha #53). **The Supabase CLI is not installed on the dev laptop** (and `npx` launchers are blocked there by the antivirus), so run the deploy from a machine that has it, or deploy from the Dashboard: `cd Web && npm run build-edge` also writes ONE self-contained file, `customer-status/_generated/dashboard/index.ts` (the function + the Shared code; only the esm.sh import is left), which is pasted into Dashboard → Edge Functions → Deploy a new function → Via Editor (name `customer-status`, "Verify JWT" ON). Rebuild and paste again after any change to the month rules.

## `whatsapp-*` (WhatsApp Cloud API)

Five functions plus the first `_shared/` folder (`_shared/whatsapp/`); full design in [whatsapp.md](whatsapp.md).
- **Staff functions:** `whatsapp-admin` and `whatsapp-send` keep JWT verification and resolve the caller through `requireAdmin`. It **does** check `users.active`, tenant active and `tenants.whatsapp_enabled`; the tenant always comes from the `users` row, never the body.
- **Public functions:** `whatsapp-onboard` (one-time session token), `whatsapp-worker` (`x-worker-secret`, called by pg_cron through Vault) and `whatsapp-webhook` (Meta HMAC over the raw body) run with `verify_jwt = false`.
- **Errors:** errors are `{ error, code }`. The app maps `code` to `whatsapp.errors.<code>` through `WhatsAppError`, keeping the server text as the fallback. A Meta refusal is a 502 with `code: "meta_error"` and Meta's own message.
- **Deploy:** `yarn deploy-whatsapp-functions` (from inside `SubsTrack/`). Adding this script changed the OTA fingerprint, so it shipped with a new native build (gotcha #53).
- **The gateway key rule above applies here too.** Meta cannot send headers, so the webhook callback URL carries `?apikey=<anon key>`. pg_cron's call to `whatsapp-worker` sends an `apikey` header read from the Vault secret `whatsapp_worker_apikey`; without it every run is a silent 401 and the queue never drains.
- The existing five functions keep their own copied `corsHeaders`/`log`/`fail`; moving them onto `_shared/` is a separate change.
