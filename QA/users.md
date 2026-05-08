# Users (Staff) — QA Scenarios

Covers the Staff list, search, create / edit, role assignment, password rules, and the "cannot change own role" guard. All staff operations are admin-only and create a paired `auth.users` + `public.users` record.

**Reference code:**
- Screen: [UserListScreen.tsx](SubsTrack/src/modules/users/screens/UserListScreen.tsx)
- Form sheet: [UserFormSheet.tsx](SubsTrack/src/modules/users/components/UserFormSheet.tsx)
- Card: [UserCard.tsx](SubsTrack/src/modules/users/components/UserCard.tsx)
- Service: [UserService.ts](SubsTrack/src/modules/users/services/UserService.ts)
- Repository: [UserRepository.ts](SubsTrack/src/modules/users/repository/UserRepository.ts) (uses RPC `create_tenant_user`)
- Store: [userStore.ts](SubsTrack/src/modules/users/store/userStore.ts)

**DB constraints:** `UNIQUE(username, tenant_id)`. Username is lowercased before insert.
**Email format:** `username@tenantcode.com` is the auth email constructed by the Edge Function / RPC at user-creation time. Login must use the same Workspace Code.

---

## 1. Staff list — render and counts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Navigate to Staff | Admin tab → Staff | Title "Staff", subtitle "<N> members · <M> admin" |
| 1.2 | Empty state | No staff besides creator | Should at minimum show the current admin |
| 1.3 | Cards | Look at cards | Username, phone (if set), role badge ("admin" or "user") |
| 1.4 | Admin count includes superadmin | If a `superadmin` exists | Counted as admin (per `useAuth.isAdmin`) |
| 1.5 | Sort | Multiple users | Sorted by username ascending (server `.order('username')`) |
| 1.6 | Refresh on focus | Leave/return | `fetchUsers` called |
| 1.7 | Pull-to-refresh | Pull down | List reloaded |

## 2. Search

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | By username | Type partial username | Filters case-insensitively |
| 2.2 | By phone | Type a phone substring | Matches users whose phone contains it |
| 2.3 | No match | Type a non-matching string | EmptyState |
| 2.4 | Clear search | Clear the input | Full list returns |

## 3. Create staff

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open form | Tap "+ Invite" | Sheet "Add Staff" |
| 3.2 | Required fields | Look at the form | Submit disabled until: Username non-blank, Password ≥ 8 chars, Confirm matches Password |
| 3.3 | Username only | Type username, leave password blank | Submit disabled |
| 3.4 | Password too short | Type 7-char password | Submit disabled |
| 3.5 | Mismatched confirm | Password = `12345678`, Confirm = `12345679` | Inline error on Confirm: "Passwords do not match"; submit disabled |
| 3.6 | Matching confirm enables submit | Both fields = `12345678` | Submit enabled (assuming username present) |
| 3.7 | Lowercase enforcement | Username = "Alice" | Stored as "alice" |
| 3.8 | Trim username | "  alice  " | Stored as "alice" |
| 3.9 | Default role | Open form | Role = "user" by default |
| 3.10 | Pick admin role | Tap "admin" tile | Selected (highlight). Saved as admin |
| 3.11 | Pick user role | Tap "user" tile | Selected. Saved as user |
| 3.12 | Phone optional | Leave phone blank | Saved as null |
| 3.13 | Phone trim | "  +1 555 ..  " | Trimmed before save |
| 3.14 | Duplicate username in tenant | Try existing username | Service: "A user with this username already exists" |
| 3.15 | Same username in different tenant | Login as different tenant, create same username | Allowed (per-tenant unique) |
| 3.16 | Network failure | Disable net | ErrorBanner; sheet stays open with values (except passwords) |
| 3.17 | Auth + profile pair | Successful create | Both `auth.users` and `public.users` rows created. New user can log in immediately with `username@tenantcode.com` |
| 3.18 | Submit loading | Slow network | Submit shows spinner; double-tap is guarded |
| 3.19 | Cancel | Tap Cancel | Sheet closes, no changes |
| 3.20 | Empty Confirm + non-empty Password | Password 8 chars, confirm blank | Submit disabled (mismatch logic only fires when both have value, but `canSubmit` requires `password === confirmPassword` which fails when one is blank) |

## 4. Edit staff

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Open edit | Tap a user card | Sheet "Edit Staff" with fields prefilled (username, phone, role) |
| 4.2 | Password fields hidden | Look at the edit form | Password / Confirm fields are NOT shown — passwords cannot be changed in this UI |
| 4.3 | Change username | Update and save | Username updated, lowercased, trimmed |
| 4.4 | Username uniqueness on edit | Rename to an existing username in same tenant | "A user with this username already exists" |
| 4.5 | Change phone | Update and save | Saved (null if cleared) |
| 4.6 | Change role | Pick new role tile | Saved |
| 4.7 | Cannot change own role — UI | Edit your own account | Both role tiles render at 40% opacity. Tap is a no-op. "Cannot change your own role" hint is shown below |
| 4.8 | Cannot change own role — service guard | Force a role change for self via API | Service throws "Cannot change your own role" |
| 4.9 | Same role on own account | Save without changing role | Allowed; other fields update |
| 4.10 | Cancel | Tap Cancel | No persistence |
| 4.11 | Network error | Disable net, save | ErrorBanner; values preserved |

## 5. Permissions and gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Admin tab visible to admin | Login as admin | Admin → Staff reachable |
| 5.2 | Admin tab hidden for user | Login as user | Admin tab is null/hidden |
| 5.3 | Superadmin treated as admin | Login as superadmin (test fixture) | Admin tab visible; staff management works the same |
| 5.4 | Tenant scoping | Login as admin of tenant A | Cannot see tenant B's users (RLS) |

## 6. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Username with spaces in middle | "alice bob" | Stored as-is (only outer trim). Verify the auth email "alice bob@tenant.com" is acceptable; if not, add validation |
| 6.2 | Username with special chars | "alice@test" | Builds email "alice@test@tenantcode.com"; verify Supabase accepts. File a finding if it doesn't |
| 6.3 | Username with diacritics | "ümut" | Lowercased and stored; verify login flow with the same value |
| 6.4 | Long password | 200 chars | Saved (Supabase auth supports). Login works |
| 6.5 | Password with whitespace | "  pass1234  " | Stored as-is (no trim — verify whether a leading space is accepted at login) |
| 6.6 | Phone numbers with country codes | "+201001234567" | Stored as-is |
| 6.7 | Two admins editing same user | A renames, then B renames | Last write wins, no merge |
| 6.8 | Form reopen clears password | Open create form after a previous create | Password / Confirm fields are blank |
| 6.9 | Toggle role on edit then cancel | Switch role tile, tap Cancel | Save not called; user role unchanged |
| 6.10 | Newly created user logs in | Take new credentials, log in | Login succeeds with `username@tenantcode.com` |
| 6.11 | Created user login fails when tenant_code missing | If migration not applied | Edge Function fails to lookup tenant_code; user creation errors. Verify error message guides the admin |
| 6.12 | Logged-in user is deleted out of band | Admin deletes a user via DB while they are logged in | On next request, RLS rejects; user is bounced to login (verify gracefully) |
| 6.13 | Loading list while inserting | Submit a new user, immediately switch tabs | List re-fetches on return; new user present |
| 6.14 | Display when phoneNumber is null | Card layout | Phone row not rendered or shows nothing — verify card layout doesn't break |

## 7. Security checks

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Password not echoed | Type password | Field is `secureTextEntry` (dots) |
| 7.2 | Password not in store | Inspect Zustand store contents after submit | No password value cached anywhere in client memory after successful submit |
| 7.3 | Password not in error response | Trigger a backend error after entering password | ErrorBanner does not include the password text |
| 7.4 | Cross-tenant query blocked | Login as tenant A admin, attempt to fetch tenant B's users | Empty result (RLS) |
| 7.5 | Self-role-change attempt at API level | Bypass the UI and call updateUser with a different role for self | Service throws error |
