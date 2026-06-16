# Users (Staff) — QA Scenarios

Covers the Staff list, search, action menu (Edit / Toggle Active / Delete), create / edit, role assignment, password rules, the "cannot change own role" guard, **delete user** (new feature), and **branch enforcement** for staff users. All operations are admin-only.

A user creation creates a paired `auth.users` + `public.users` row via the `create-user` Edge Function (or the equivalent RPC), which atomically verifies tenant + branch and forces tenant scoping from the caller's JWT.

**Reference code:**
- Screen: [UserListScreen.tsx](SubsTrack/src/modules/users/screens/UserListScreen.tsx)
- Form sheet: [UserFormSheet.tsx](SubsTrack/src/modules/users/components/UserFormSheet.tsx)
- Card: [UserCard.tsx](SubsTrack/src/modules/users/components/UserCard.tsx)
- Action menu: [ActionMenu.tsx](SubsTrack/src/shared/components/ActionMenu.tsx)
- Service: [UserService.ts](SubsTrack/src/modules/users/services/UserService.ts)
- Repository: [UserRepository.ts](SubsTrack/src/modules/users/repository/UserRepository.ts)
- Edge function: [supabase/functions/create-user/index.ts](SubsTrack/supabase/functions/create-user/index.ts)
- Store: [userStore.ts](SubsTrack/src/modules/users/store/userStore.ts)

**DB constraints:**
- `UNIQUE(username, tenant_id)` — username is lowercased before insert.
- Email format `username@tenantcode.com` constructed at user-creation time.
- `users.branch_id` nullable: NULL = tenant-wide admin. Staff (role=user) require `branch_id` once any branch exists in the tenant.

---

## 0. Critical invariants

1. **Tenant isolation.** Cross-tenant user creation/listing is blocked by RLS. The Edge Function additionally re-derives `tenant_id` from the caller's JWT.
2. **Cannot change your own role.** Enforced in UI (tiles disabled) and in `UserService`.
3. **Cannot delete yourself.** Enforced — verify in service and UI.
4. **Cannot delete other admins (unless caller is superadmin).** Admin can manage `user`-role accounts. Verify `canManage` rule in `UserListScreen.buildMenuActions`.
5. **Staff users require a branch.** Once tenant has ≥1 active branch, role=user without branch_id is rejected by `UserService.validateBranchAssignment` AND by the Edge Function.

---

## 1. Staff list — render and counts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Navigate to Staff | Admin tab → Staff | Title "Staff", "<N> members · <M> admin" subtitle |
| 1.2 | BranchSelector chip | Tenant-wide admin with ≥2 branches | Chip shown |
| 1.3 | Empty state | No staff besides creator | Shows the current admin |
| 1.4 | Cards | Look at cards | Full name, username, phone (if set), role badge ("admin" or "user"), branch label (if assigned), ⋮ menu |
| 1.5 | Admin count includes superadmin | superadmin exists | Counted as admin |
| 1.6 | Sort | Multiple users | Username ascending (server `.order('username')`) |
| 1.7 | Refresh on focus | Leave/return | `fetchUsers` called |
| 1.8 | Pull-to-refresh | Pull down | List reloaded |
| 1.9 | Branch chip switch refetch | Switch BranchSelector | User list re-fetches for new scope |

## 2. Search

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | By username | Type partial username | Filters case-insensitively |
| 2.2 | By full name | Type fragment | Matches |
| 2.3 | By phone | Type a phone substring | Matches |
| 2.4 | No match | Type a non-matching string | EmptyState |
| 2.5 | Clear search | Clear the input | Full list returns |

## 3. Create staff

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open form | Tap "+ Add" | Sheet "Add Staff" |
| 3.2 | Required fields marked with asterisk | Look at labels | Full Name*, Username*, Password*, Confirm Password*, Role (default user) |
| 3.3 | Submit disabled until valid | Open the form | Disabled until: Full Name + Username non-blank, Password ≥ 8 chars, Confirm matches Password, Branch valid (when required) |
| 3.4 | Username only | Type username, leave password blank | Submit disabled |
| 3.5 | Password too short | 7-char password | Submit disabled |
| 3.6 | Mismatched confirm | Different confirm | Inline error "Passwords do not match"; submit disabled |
| 3.7 | Matching confirm enables submit | Both match | Submit enabled (assuming other fields filled) |
| 3.8 | Lowercase enforcement | Username = "Alice" | Stored as "alice" |
| 3.9 | Trim username | "  alice  " | Stored as "alice" |
| 3.10 | Default role | Open form | Role = "user" |
| 3.11 | Pick admin role | Tap "admin" tile | Selected |
| 3.12 | Pick user role | Tap "user" tile | Selected |
| 3.13 | Phone optional | Leave phone blank | Saved as null |
| 3.14 | Phone trim | "  +1 555 .. " | Trimmed before save |
| 3.15 | Duplicate username in tenant | Existing username | "A user with this username already exists" |
| 3.16 | Same username different tenant | Login as different tenant | Allowed |
| 3.17 | Network failure | Disable net | ErrorBanner; sheet stays open (passwords cleared) |
| 3.18 | Auth + profile pair | Successful create | Both `auth.users` and `public.users` rows created. New user can log in with `username@tenantcode.com` |
| 3.19 | Submit loading | Slow create | Spinner; double-tap guarded |
| 3.20 | Cancel | Tap Cancel | Sheet closes, no changes |
| 3.21 | Empty Confirm + non-empty Password | Submit disabled |
| 3.22 | Active toggle default | Open form | New user defaults to `active = true` |

## 4. Create staff — branch enforcement

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Zero-branch tenant | No branches | No branch picker; role can be admin or user; created with `branch_id = NULL` |
| 4.2 | Single-branch tenant — admin | Exactly 1 active branch, role=admin | Branch picker hidden (single-branch behavior). Admin defaults to tenant-wide (`branch_id = NULL`) — verify UX intent |
| 4.3 | Single-branch tenant — user | role=user | Auto-bind to the only branch |
| 4.4 | Multi-branch — tenant-wide admin opens form | role=user | Branch picker shown, **required** (`nullable = false`). Submit disabled until a branch is picked |
| 4.5 | Multi-branch — tenant-wide admin opens form | role=admin | Branch picker shown with extra "Tenant-wide" / "Unassigned" option (nullable). Defaults to tenant-wide |
| 4.6 | Multi-branch — branch admin creates user | role=user | No branch picker; auto-assigned to creator's branch |
| 4.7 | Multi-branch — branch admin creates admin | role=admin | Picker hidden or limited; verify branch admin can only create branch-scoped admins (not tenant-wide) |
| 4.8 | Branch required validation surface | Tenant-wide admin, role=user, branch left blank | Submit disabled with hint "Staff users must be assigned to a branch" |
| 4.9 | Role flip to admin clears branch requirement | Switch role from user → admin in the form | Branch picker toggles to nullable; can clear branch to make user tenant-wide |
| 4.10 | Edge function — cross-branch attack | Beirut admin POSTs createUser with `branchId = Tripoli_id` | Edge function ignores the supplied branchId and forces caller's own branch |
| 4.11 | Edge function — invalid branchId | Tenant-wide admin passes a branchId from another tenant | Edge function returns "Invalid branch for this tenant" |

## 5. Edit staff

Reachable from the action menu (Edit item).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Open edit | Tap a user / Edit menu | Sheet "Edit Staff" with fields prefilled (full name, username, phone, role, branch) |
| 5.2 | Change-password toggle | Edit form | A "Change password" checkbox is shown. Off by default; New Password + Confirm fields are hidden until it is enabled |
| 5.3 | Change full name / username | Update and save | Stored (username lowercased + trimmed) |
| 5.4 | Username uniqueness on edit | Rename to existing username in same tenant | "A user with this username already exists" |
| 5.5 | Change phone | Update and save | Saved (null if cleared) |
| 5.6 | Change role | Pick new role tile | Saved (subject to "cannot change own role") |
| 5.7 | Change branch | Reassign | Saved. Visibility scope changes per RLS |
| 5.8 | Cannot change own role — UI | Edit your own account | Both role tiles render at 40% opacity. Tap is a no-op. Hint "Cannot change your own role" |
| 5.9 | Cannot change own role — service guard | Bypass UI via API | Service throws "Cannot change your own role" |
| 5.10 | Same role on own account | Save without changing role | Allowed; other fields update |
| 5.11 | Cancel | Tap Cancel | No persistence |
| 5.12 | Network error | Disable net, save | ErrorBanner; values preserved |
| 5.13 | Change password — happy path | Enable toggle, New Password ≥ 8 + matching Confirm, save | Password updated; login with the new password works |
| 5.14 | New password too short / mismatch | 7 chars, or Confirm differs | Submit disabled (and service re-validates ≥ 8) |
| 5.15 | Admin changes own password | Log in as an `admin`, edit own account, enable toggle, save a new password | Succeeds — self-service is always allowed. **(Regression: previously returned a generic "Edge Function returned a non-2xx status code" because the edge function blocked admins from changing any non-staff password, including their own.)** |
| 5.16 | Admin changes a staff user's password | Admin edits a `user`-role account, change password | Succeeds |
| 5.17 | Admin changes ANOTHER admin's password | Admin A edits Admin B (not self), change password | Forbidden — ErrorBanner shows the server message "admins can only change passwords of staff users" (no longer the generic non-2xx text) |
| 5.18 | Superadmin changes any password | Superadmin edits any same-tenant user, change password | Succeeds |
| 5.19 | Cross-tenant password change | Caller targets a user in another tenant (via API) | Forbidden — "cannot modify users from another tenant" surfaces in the ErrorBanner |

## 6. Action menu (per user card)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Open menu | Tap ⋮ or long-press | ActionMenu opens with user's full name as title |
| 6.2 | Items for own account | Open menu on yourself | "Edit" only (no Toggle Active, no Delete) |
| 6.3 | Items — admin managing a user | Admin opens menu on a `user`-role account | Edit + Toggle Active + Delete |
| 6.4 | Items — admin viewing another admin | Admin opens menu on another admin | Edit only (admin can't manage other admins; superadmin can) |
| 6.5 | Items — superadmin | Superadmin opens menu on any other user | Edit + Toggle Active + Delete |
| 6.6 | Tap Edit | Opens UserFormSheet in edit mode |
| 6.7 | Tap Toggle Active | Opens ConfirmDialog "Deactivate <fullName>?" or "Activate <fullName>?" |
| 6.8 | Tap Delete | Opens ConfirmDialog destructive "Delete <fullName>? This cannot be undone." |

## 7. Activate / Deactivate user

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Deactivate confirm | Tap toggle on active user | ConfirmDialog destructive. On Confirm: `active = false` |
| 7.2 | Inactive user cannot login | After deactivation, attempt login as that user | Login fails (verify which error message — "Invalid username or password" or a specific account-disabled error) |
| 7.3 | Reactivate | Tap toggle on inactive user | ConfirmDialog non-destructive. On Confirm: `active = true` |
| 7.4 | Existing session not killed | Deactivate a user who is currently logged in | They remain logged in until next session refresh. Verify expected behavior (no live polling) |
| 7.5 | Cancel | Tap Cancel | No change |
| 7.6 | Network error | Disable net | ErrorBanner; status not toggled |

## 8. Delete user

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Confirm dialog | Tap Delete | ConfirmDialog destructive: "Delete <fullName>?" |
| 8.2 | Hard delete | Confirm | Both `auth.users` and `public.users` rows removed (verify cascade) |
| 8.3 | Cannot delete self | Try to delete own row | Menu hides Delete; service rejects if forced |
| 8.4 | Cannot delete other admin (when caller is admin) | Admin deletes another admin | Menu hides Delete; service rejects |
| 8.5 | Superadmin can delete admin | Superadmin tries | Allowed |
| 8.6 | Cascade — payments | User was `received_by_user_id` on payments | FK `ON DELETE SET NULL`; payment records preserved with null receiver |
| 8.7 | Cascade — voids | User voided some payments | `voided_by` FK behavior — verify (`ON DELETE SET NULL` typical) |
| 8.8 | Deleted user cannot log in | After deletion, attempt login | Login fails |
| 8.9 | Cancel | Tap Cancel | No change |
| 8.10 | Network error | Disable net | ErrorBanner; user still present |

## 9. Permissions and gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Admin tab visible to admin | Login as admin | Admin → Staff reachable |
| 9.2 | Admin tab hidden for user | Login as user | Admin tab null/hidden |
| 9.3 | Superadmin treated as admin | Login as superadmin | Admin tab visible |
| 9.4 | Tenant scoping | Admin of tenant A | Cannot see tenant B users (RLS) |
| 9.5 | Branch admin sees own branch users | Beirut admin | Only Beirut users + tenant-wide admins (if visible) |

## 10. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Username with spaces in middle | "alice bob" | Stored as-is (only outer trim). Verify the auth email "alice bob@tenant.com" is acceptable; if not, add validation |
| 10.2 | Username with special chars | "alice@test" | Builds email "alice@test@tenantcode.com"; verify Supabase accepts |
| 10.3 | Username with diacritics | "ümut" | Lowercased and stored; verify login flow |
| 10.4 | Long password | 200 chars | Saved (Supabase auth supports). Login works |
| 10.5 | Password with whitespace | "  pass1234  " | Stored as-is — verify login |
| 10.6 | Phone numbers with country codes | "+201001234567" | Stored as-is |
| 10.7 | Two admins editing same user | A renames, then B renames | Last write wins |
| 10.8 | Form reopen clears password | Open create after a previous create | Password / Confirm blank |
| 10.9 | Toggle role on edit then cancel | Switch role tile, tap Cancel | Save not called; user role unchanged |
| 10.10 | Newly created user logs in | New credentials | Login succeeds with `username@tenantcode.com` |
| 10.11 | Created user login fails when tenant_code missing | If migration not applied | Edge Function errors |
| 10.12 | Logged-in user is deleted out of band | Admin deletes a user while they are logged in | Their next request fails (RLS denies); bounced to login |
| 10.13 | Display when phone is null | Card layout doesn't break |
| 10.14 | User without branch in multi-branch tenant | Pre-existing user with `branch_id = NULL` and role=user | Visible only to tenant-wide admins. Edit forces a branch assignment before save |

## 11. Security checks

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Password not echoed | Type password | Field is `secureTextEntry` (dots) |
| 11.2 | Password not in store | Inspect Zustand store after submit | No password value cached |
| 11.3 | Password not in error response | Trigger backend error after entering password | ErrorBanner does not include the password |
| 11.4 | Cross-tenant query blocked | Admin A → fetch tenant B users | Empty result (RLS) |
| 11.5 | Self-role-change attempt at API level | Bypass UI | Service throws |
| 11.6 | Self-delete attempt at API level | Bypass UI | Service throws |
| 11.7 | Cross-branch user creation attempt | Beirut admin forces branchId = Tripoli | Edge function overrides — see § 4.10 |
