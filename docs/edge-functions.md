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

## `whatsapp-*` (WhatsApp Cloud API)

Five functions plus the first `_shared/` folder (`_shared/whatsapp/`); full design in [whatsapp.md](whatsapp.md).
- **Staff functions:** `whatsapp-admin` and `whatsapp-send` keep JWT verification and resolve the caller through `requireAdmin`. It **does** check `users.active`, tenant active and `tenants.whatsapp_enabled`; the tenant always comes from the `users` row, never the body.
- **Public functions:** `whatsapp-onboard` (one-time session token), `whatsapp-worker` (`x-worker-secret`, called by pg_cron through Vault) and `whatsapp-webhook` (Meta HMAC over the raw body) run with `verify_jwt = false`.
- **Errors:** errors are `{ error, code }`. The app maps `code` to `whatsapp.errors.<code>` through `WhatsAppError`, keeping the server text as the fallback. A Meta refusal is a 502 with `code: "meta_error"` and Meta's own message.
- **Deploy:** `yarn deploy-whatsapp-functions` (from inside `SubsTrack/`). Adding this script changed the OTA fingerprint, so it shipped with a new native build (gotcha #53).
- **The gateway key rule above applies here too.** Meta cannot send headers, so the webhook callback URL carries `?apikey=<anon key>`. pg_cron's call to `whatsapp-worker` sends an `apikey` header read from the Vault secret `whatsapp_worker_apikey`; without it every run is a silent 401 and the queue never drains.
- The existing five functions keep their own copied `corsHeaders`/`log`/`fail`; moving them onto `_shared/` is a separate change.
