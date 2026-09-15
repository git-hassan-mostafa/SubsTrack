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
  1. `tenants` — `customer_allowance` and `price_per_customer_usd` are **omitted on purpose** so the schema defaults (30 at $0.15) decide the starting deal in exactly one place. 30 is also the product floor, so a self-service tenant is born exactly on it.
  2. `branches` ('Default Branch').
  3. Auto-seed an `LBP` currency (`decimals 0`, symbol `ل.ل`) using `app_options.LiraRate` (fallback `DEFAULT_LIRA_RATE = 89000`).
  4. `auth.users`.
  5. `public.users` (role = `superadmin`, `branch_id = null`).
- The pre-check on the organization signup screen uses the `is_tenant_code_available` SECURITY DEFINER RPC (granted to `anon`) — returns a boolean only, no row data.
- Accepts (but currently ignores) a `paymentToken` field in the request body — the hook point for future paid-plan gating.
- Deploy: `yarn deploy-create-tenant-edge-function` (from inside `SubsTrack/`). An edge function does **not** ship over OTA, so after the per-customer-pricing change it must be redeployed **before** `script.sql` runs — deploying first is safe (an insert without the dropped `tier_id` still works while the column has a default), the reverse order 500s every signup in between.

See `docs/features.md` → Authentication Flow for how signup drives this, and gotcha #33 for the full anon-path rationale.
