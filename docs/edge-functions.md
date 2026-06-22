# Supabase Edge Functions

> Deno-runtime functions under `SubsTrack/supabase/functions/`. Referenced from `CLAUDE.md`.
> Error handling for ALL of these is governed by gotcha #40 in `docs/gotchas.md` — invoke errors must go through `BaseRepository.handleFunctionsError` / `readFunctionsErrorBody`, never raw `handleError`.

## `create-user`

Located at `SubsTrack/supabase/functions/create-user/index.ts`.

- Atomically creates both `auth.users` and `public.users` rows.
- Verifies caller is an admin via their JWT.
- Enforces tenant isolation — admin can only create users in their own tenant.
- For branch-scoped callers, validates and forces `branch_id` to the caller's branch.
- Rolls back the `auth.users` entry if `public.users` insert fails.
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

- **Public** edge function — deployed with `--no-verify-jwt` (no JWT required). The **sole** anon-accessible path for creating a tenant (the app ships only the anon key, and there is no INSERT policy on `tenants`/`branches`/`tier_plans`).
- **Signup gate:** before any work, reads `app_options.AllowSelfServiceSignup`; an explicit `'false'` returns `403 { error, code: 'signup_disabled' }`. A missing/blank row defaults to allowed (a misconfigured option must never lock out signup). This is the authoritative enforcement — the login screen also hides the entry point, but the server is the source of truth.
- Uses the service-role key to perform the full sequence with cascading rollback on any step:
  1. Lookup the Free tier id.
  2. `tenants` (with `tier_id = Free`).
  3. `branches` ('Default Branch').
  4. Auto-seed an `LBP` currency (`decimals 0`, symbol `ل.ل`) using `app_options.LiraRate` (fallback `DEFAULT_LIRA_RATE = 89000`).
  5. `auth.users`.
  6. `public.users` (role = `superadmin`, `branch_id = null`).
- The pre-check on the workspace signup screen uses the `is_tenant_code_available` SECURITY DEFINER RPC (granted to `anon`) — returns a boolean only, no row data.
- Accepts (but currently ignores) a `paymentToken` field in the request body — the hook point for future paid-plan gating.
- Deploy: `yarn deploy-create-tenant-edge-function` (from inside `SubsTrack/`).

See `docs/features.md` → Authentication Flow for how signup drives this, and gotcha #33 for the full anon-path rationale.
