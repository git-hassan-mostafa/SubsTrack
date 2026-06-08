# Self-Service Tenant Signup — QA Scenarios

Covers the 2-step public signup flow that lets a new business owner create their own workspace without involving the SaaS admin. Step 1 collects workspace name + tenant code. Step 2 collects the owner account credentials. On success, the tenant is created and the owner is auto-logged in.

This flow uses the `create-tenant` Edge Function (no JWT required — deployed with `--no-verify-jwt`). The anon key in the mobile app cannot write directly to `tenants`, `branches`, or `auth.users` tables — the Edge Function is the only permitted path.

**Reference code:**
- Signup slice: [signupSlice.ts](SubsTrack/src/state/slices/signup/signupSlice.ts)
- Signup service: [SignupService.ts](SubsTrack/src/modules/signup/services/SignupService.ts)
- Signup repository: [SignupRepository.ts](SubsTrack/src/modules/signup/repository/SignupRepository.ts)
- Step 1 screen: [SignupWorkspaceScreen.tsx](SubsTrack/src/modules/signup/screens/SignupWorkspaceScreen.tsx)
- Step 2 screen: [SignupAccountScreen.tsx](SubsTrack/src/modules/signup/screens/SignupAccountScreen.tsx)
- Step indicator: [StepIndicator.tsx](SubsTrack/src/modules/signup/components/StepIndicator.tsx)
- Edge function: [create-tenant/index.ts](SubsTrack/supabase/functions/create-tenant/index.ts)
- Login entry point: [LoginScreen.tsx](SubsTrack/src/modules/auth/screens/LoginScreen.tsx)
- Route: [signup-workspace.tsx](SubsTrack/app/(auth)/signup-workspace.tsx), [signup-account.tsx](SubsTrack/app/(auth)/signup-account.tsx)

---

## 0. Critical invariants

1. **Edge Function is the sole creation path.** No direct `INSERT` on `tenants`, `branches`, or `auth.users` from the mobile app. Verify no RLS INSERT policy on these tables for `anon`.
2. **Atomic creation with cascading rollback.** The Edge Function sequence: `tier_plans (Free id lookup)` → `tenants` → `branches (Default Branch)` → `auth.users` → `public.users (role=superadmin, branch_id=null)`. Any failure rolls back all preceding steps.
3. **Owner role = `superadmin`.** The new tenant owner gets `role = superadmin` in `public.users`. This is the same role assignment SuperAdmin uses for tenant owners — the owner does NOT appear in their own Staff list (per-app role filter).
4. **Tenant code pre-check** uses `is_tenant_code_available` RPC — a `SECURITY DEFINER` function granted to `anon`. It returns a boolean (no row data). The mobile app never sees a list of existing tenant codes.
5. **Default Branch auto-created.** Every new tenant gets a "Default Branch" row immediately after the tenant row.
6. **New tenant defaults to Free tier.** `tier_id` is resolved server-side to the Free tier's id — client cannot set a paid tier via this flow.
7. **Auto-login after signup.** On Edge Function success, `signupSlice.submit()` immediately calls `authSlice.login()` with the entered credentials. User lands in the app without a manual login step.

---

## 1. Entry point — Login screen CTA

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | CTA visible | Open login screen | "Create a new workspace" button / link visible below the login form |
| 1.2 | Tap CTA | Tap "Create a new workspace" | Navigates to Step 1 (SignupWorkspaceScreen) |
| 1.3 | Back from step 1 | Navigate back | Returns to login screen |

---

## 2. Step 1 — Workspace details (SignupWorkspaceScreen)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Step indicator | Look at the top | Step indicator shows "1 / 2" (first dot filled, second dot empty) |
| 2.2 | Fields visible | Look at screen | Workspace Name field + Tenant Code field |
| 2.3 | Happy path | Enter "My ISP" as name, "myisp" as code, tap Next | Code availability checked; transitions to Step 2 |
| 2.4 | Required: name | Leave name blank | "Next" button disabled or inline validation error |
| 2.5 | Required: code | Leave code blank | "Next" button disabled |
| 2.6 | Code available | Enter a code not in use | `is_tenant_code_available` returns true; proceeds to step 2 |
| 2.7 | Code taken | Enter an existing tenant code | Inline error: "This workspace code is already taken" (or equivalent) |
| 2.8 | Code validation — length | Enter a code that is too short or too long | Validation error displayed (verify min/max per `SignupService.validateWorkspace`) |
| 2.9 | Code validation — characters | Enter code with spaces or special characters | Validation error; only allowed characters accepted |
| 2.10 | Code case handling | Enter "MYISP" (uppercase) | Code normalised to lowercase before availability check (verify expected behavior) |
| 2.11 | Name max length | Enter very long workspace name | Verify client-side or server-side trim/reject |
| 2.12 | Loading state on Next | Tap Next | Button shows "..." while availability check is in-flight |
| 2.13 | Network error on check | Disable network, tap Next | ErrorBanner shown; stays on Step 1 |
| 2.14 | Retry after error | Fix network, tap Next again | Retries cleanly |

---

## 3. Step 2 — Owner account (SignupAccountScreen)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Step indicator | Look at the top | Step indicator shows "2 / 2" (both dots filled / second active) |
| 3.2 | Fields visible | Look at screen | Full Name, Username, Password, Confirm Password fields |
| 3.3 | Back from step 2 | Navigate back | Returns to Step 1 with previously entered workspace data pre-filled |
| 3.4 | Required: all fields | Leave any field blank | Submit disabled |
| 3.5 | Password min length | Enter password shorter than minimum (8 chars) | Inline error: "Password must be at least 8 characters" |
| 3.6 | Password mismatch | Enter different passwords | Inline error: "Passwords do not match". Submit disabled |
| 3.7 | Password match | Enter matching passwords ≥ 8 chars | No error; submit enabled |
| 3.8 | Username uniqueness | Username will be unique per tenant (own tenant — no conflict possible at this stage) | No pre-check needed |
| 3.9 | Happy path — submit | Fill all fields correctly, tap "Create Workspace" | Loading spinner shown; Edge Function called |
| 3.10 | Loading state | Slow network | Button shows "..." / disabled during in-flight call |
| 3.11 | Success — auto-login | Edge Function succeeds | User lands on the main app (admin/superadmin home), no manual login required |
| 3.12 | Error — code conflict (race) | Two users submit same code simultaneously | Second request fails; error shown; user returned to Step 1 to pick a new code |
| 3.13 | Error — partial rollback | Edge Function fails mid-sequence (e.g., after tenant insert but before auth.users) | All created rows rolled back; no orphaned tenant; user sees an error message |
| 3.14 | Network error | Disable network, submit | ErrorBanner on Step 2; no tenant created |
| 3.15 | In-flight guard | Double-tap submit | Loading flag prevents duplicate call |

---

## 4. Post-signup state

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Tenant created | After signup | New row in `tenants` with `tier_id = Free`, `active = true` |
| 4.2 | Default branch created | After signup | `branches` row with name "Default Branch" and `tenant_id` of the new tenant |
| 4.3 | Owner account created | After signup | `auth.users` row + `public.users` row with `role = superadmin`, `branch_id = null` |
| 4.4 | Owner in-app role | Log in as new owner | App treats them as admin (superadmin filtered from Staff list) |
| 4.5 | Free tier limits apply | Try to create more customers than Free allows | Tier limit enforcement active from day 1 |
| 4.6 | Currency list empty | New tenant, open Currencies settings | Only USD base card shown (no tenant currencies yet) |
| 4.7 | Staff list empty | New tenant, open Staff | No users shown (owner's superadmin role is filtered from the list) |
| 4.8 | Session persistence | Kill app after signup, reopen | Session restored; user stays logged in |
| 4.9 | Subscription screen | Open Admin → Subscription | Shows Free tier active; Pro and Business available for upgrade |

---

## 5. Security checks

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | No direct tenant INSERT | Try to POST directly to `/rest/v1/tenants` with anon key | Supabase RLS rejects (no INSERT policy for `anon`) |
| 5.2 | tenant_id from server only | Inspect the created tenant row | `tenant_id` on all child rows set server-side in the Edge Function, never from client input |
| 5.3 | Tier set server-side | Inspect tenant row | `tier_id` resolves to Free server-side; client cannot override it to Pro/Business |
| 5.4 | Role set server-side | Inspect `public.users` row | `role = superadmin` set in Edge Function; client cannot inject a different role |
| 5.5 | `paymentToken` field accepted but ignored | Send payload with a `paymentToken` field | Edge Function ignores it; no billing side-effect |

---

## 6. Multi-tenancy isolation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | New tenant isolated | Create workspace, log in, open customers | Empty lists; no data from other tenants |
| 6.2 | RLS from day 1 | New tenant queries any table | All results scoped to own `tenant_id` via JWT claim |
| 6.3 | Existing tenants unaffected | While one user signs up | Other tenants' data untouched |

---

## 7. UX and navigation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Hardware back during step 1 | Press back | Returns to login |
| 7.2 | Hardware back during step 2 | Press back | Returns to step 1 with workspace data preserved |
| 7.3 | Already-logged-in user | Navigate to `/(auth)/signup-workspace` while logged in | Redirected to the main app (auth layout guards against it) |
| 7.4 | Language | App in Arabic | Both signup screens render RTL; all labels translated |
| 7.5 | Small device | Signup on iPhone SE | Fields not clipped; scroll works |
| 7.6 | Keyboard avoidance | Focus on Password field | Form scrolls up so field is visible above keyboard |
