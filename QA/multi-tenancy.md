# Multi-Tenancy & Data Isolation — QA Scenarios

A separate file because tenant isolation is a CRITICAL release blocker. Every other module is conditionally correct on these scenarios.

**Reference code:**

- AuthService (tenant lookup, tenant_active flag): [AuthService.ts](SubsTrack/src/modules/auth/services/AuthService.ts)
- Tenant inactive screen: [TenantInactiveScreen.tsx](SubsTrack/src/modules/auth/screens/TenantInactiveScreen.tsx)
- All repositories rely on Supabase RLS policies that filter by `tenant_id` — see Supabase migrations.
- Auth email format: `username@tenantcode.com` — both fields scope into a single tenant.

---

## 1. Cross-tenant isolation — reads

| #   | Scenario                                  | Steps                                                    | Expected result                                                   |
| --- | ----------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| 1.1 | Customer list                             | Login as tenant A admin                                  | Only tenant A customers visible                                   |
| 1.2 | Customer list — switch tenant             | Logout, login as tenant B admin                          | Tenant B customers visible. Zero tenant A customers visible       |
| 1.3 | Plan list                                 | Login as tenant A                                        | Only tenant A plans                                               |
| 1.4 | Plan list — switch tenant                 | Same                                                     | Tenant B plans only                                               |
| 1.5 | Staff list                                | Login as tenant A admin                                  | Only tenant A users                                               |
| 1.6 | Dashboard metrics                         | Login as tenant A                                        | Counts/sums based on tenant A data only                           |
| 1.7 | Customer detail by id from another tenant | Take a customer UUID from tenant B, deeplink as tenant A | Detail fetch returns "Customer not found" or similar — RLS denies |
| 1.8 | Payment year fetch — cross tenant         | Manipulate a request to query tenant B payments          | RLS denies; UI shows empty grid or error                          |

## 2. Cross-tenant isolation — writes

| #   | Scenario                                                  | Steps                                                        | Expected result                                            |
| --- | --------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 2.1 | Create customer                                           | Login as tenant A                                            | New row's `tenant_id = A`                                  |
| 2.2 | Update tenant_id manually                                 | Attempt to PATCH a customer's tenant_id                      | RLS rejects                                                |
| 2.3 | Insert payment for tenant B customer while logged in as A | Forge request                                                | Backend denies; surface a friendly error                   |
| 2.4 | Plan reuse                                                | Create a plan in tenant A, in tenant B create with same name | Both succeed (per-tenant uniqueness)                       |
| 2.5 | User reuse                                                | Create a user with username `alice` in tenant A and tenant B | Both succeed; login uses organization code to disambiguate |

## 3. Tenant active / inactive

| #   | Scenario                            | Steps                                            | Expected result                                                                                 |
| --- | ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 3.1 | Login when tenant.active = false    | Use creds for a deactivated tenant               | TenantInactiveScreen rendered                                                                   |
| 3.2 | Background tenant deactivation      | While user is in app, tenant flipped to inactive | UI does not auto-switch (no live polling). On next cold start, TenantInactiveScreen shown       |
| 3.3 | Re-activation                       | Tenant flipped back to active                    | User must logout & relogin (or relaunch app with restored session) to clear the inactive screen |
| 3.4 | Inactive tenant cannot make changes | Force a write while tenantActive = false         | UI never reaches forms; if forced via API, RLS policies should still block (verify)             |

## 4. Organization code (tenant_code)

| #   | Scenario                                | Steps                                       | Expected result                                          |
| --- | --------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| 4.1 | Login with correct tenant_code          | "acme-isp" or whatever the tenant's code is | Login succeeds                                           |
| 4.2 | Login with wrong tenant_code            | Wrong code, valid creds                     | "Invalid username or password" (the email lookup misses) |
| 4.3 | tenant_code casing                      | "ACME-ISP" entered                          | Login succeeds — tenant_code is lowercased               |
| 4.4 | tenant_code with leading/trailing space | " acme-isp "                                | Trimmed; login succeeds                                  |
| 4.5 | Migration not applied                   | Backend missing tenant_code column          | Login fails for new users created via Edge Function      |

## 5. Session restoration with tenant changes

| #   | Scenario                                | Steps                                 | Expected result                                                                       |
| --- | --------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| 5.1 | Cold start with previously valid tenant | Returning user, tenant active         | Routed to Customers tab                                                               |
| 5.2 | Cold start with deactivated tenant      | Same user, tenant flipped to inactive | TenantInactiveScreen                                                                  |
| 5.3 | Cold start with deleted tenant          | Tenant row removed                    | "account_not_configured" treatment via `restoreSession` returning null → login screen |
| 5.4 | Cold start with deleted user profile    | `public.users` row removed            | Same as 5.3                                                                           |

## 6. Logout / re-login churn

| #   | Scenario                                | Steps                     | Expected result                                                                                                   |
| --- | --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 6.1 | Logout from tenant A, login to tenant B | Sequential                | No tenant A data visible at any time during the transition (`endSession` resets every store and bumps the data epoch) |
| 6.2 | Three rapid switches A→B→A              | Three logout/login cycles | Each cycle shows only the active tenant's data                                                                    |
| 6.3 | Stale state on slow login               | Tenant B login is slow    | LoadingScreen shown until session resolved; no glimpse of A's data                                                |

## 7. Edge cases

| #   | Scenario                                          | Steps                                                                                               | Expected result                                                                        |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 7.1 | Two tenants with identical user names + passwords | Create alice/Pass1234 in A and alice/Pass1234 in B                                                  | Login routed by tenant_code only — each tenant lands on its own data                   |
| 7.2 | Same email format collision                       | If two tenants share a tenant_code somehow                                                          | Should be impossible via DB unique constraint on tenant_code; verify constraint exists |
| 7.3 | RLS regression                                    | Run smoke tests for each table after any RLS migration                                              | Tenant A admin must NOT be able to read or write any row with tenant_id ≠ A            |
| 7.4 | Deeplink across tenants                           | Tenant A user has a tenant B's customer UUID                                                        | Cannot open detail (data missing under RLS)                                            |
| 7.5 | Payment unique constraint cross-tenant            | Tenant A customer X and tenant B customer Y both have (X.id, '2026-05-01') and (Y.id, '2026-05-01') | Both allowed (constraint scoped to customer_id, billing_month)                         |
| 7.6 | Plan deleted cross-tenant                         | Should not be possible — RLS denies cross-tenant writes                                             | Confirm                                                                                |

## 8. Manual probe checklist (must pass before release)

- Two-tenant setup with identical usernames.
- Verify each row of every table has `tenant_id` set automatically on insert.
- Pull all rows as Tenant A and confirm none have tenant_id != A.
- Repeat for Tenant B.
- Force-craft requests with another tenant's id in the JWT — must fail.
- Pause/resume tenant.active and verify the inactive screen flow at every state transition.

## 9. One device, two people (local mirror scope)

Native only — the web app holds no mirror. "Clear local data" is Settings → Developer (admin-only).

| #   | Scenario                                       | Steps                                                                                                                        | Expected result                                                                                                                                                                             |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | Same person signs back in                      | Admin logs out and logs straight back in                                                                                     | No full re-download — the mirror is kept and an incremental sync runs                                                                                                                       |
| 9.2 | Admin hands the device to staff, same branch   | Admin of branch A logs out → staff of branch A logs in                                                                       | The mirror is **wiped** and fully re-pulled; `sync_meta.active_role_scope` reads `staff`                                                                                                     |
| 9.3 | Staff hands it back                            | After 9.2, the admin logs back in                                                                                            | Wiped and re-pulled again; **every expense and audit entry created while staff were signed in is present** (the old single-cursor gap)                                                       |
| 9.4 | Branch-scope change                            | Tenant-wide admin logs out → branch-scoped admin of the same tenant logs in                                                   | Wiped and re-pulled; `active_branch_scope` is that branch id                                                                                                                                |
| 9.5 | Different organization                         | Admin of tenant A logs out → admin of tenant B logs in                                                                       | Wiped and re-pulled; `active_tenant_id` is B                                                                                                                                                |
| 9.6 | Superadmin ↔ admin of the same tenant + branch | Log out as admin → log in as superadmin                                                                                      | **No** wipe — both read the same rows, so the role scope stays `admin`                                                                                                                      |
| 9.7 | Un-pushed money blocks the switch              | Collect a payment while offline → log out (still offline) → log in as another organization's user (online)                    | Login is refused with the "sign back into the previous organization and sync first" message; the mirror still holds tenant A's rows and the un-pushed collection                             |
| 9.8 | Queued audit rows do not block it              | Produce only audit entries offline (no money writes) → log out offline → log in as another organization's user                | The switch is allowed; the un-pushed audit rows are discarded with the wipe (documented trade)                                                                                               |
| 9.9 | Deactivated account cannot wipe the mirror     | Admin of tenant A is signed in → a **deactivated** user of tenant B logs in with correct credentials                           | Login is refused ("account deactivated") **and** tenant A's mirror is untouched — re-open the app offline and A's data is still there                                                        |
| 9.10| Upgrade from a build without the role key      | Install the previous build, log in, update over it, log in again as the same user                                            | No wipe, no full re-download; `active_role_scope` is backfilled for that user                                                                                                               |
| 9.11| Clear local data                               | Settings → Developer → Clear local data, confirm                                                                             | Row counts drop to zero, a full re-pull runs, screens repopulate. Nothing on the server changed                                                                                              |
| 9.12| Clear local data names what it will lose       | Collect a payment while offline, then open Clear local data                                                                  | The confirm states how many un-pushed changes will be lost; Cancel leaves everything intact                                                                                                 |
| 9.13| Clear local data while offline                 | Turn off the network, run Clear local data                                                                                   | Data is cleared and the message says to connect to re-download; reconnecting and syncing restores everything                                                                                 |
