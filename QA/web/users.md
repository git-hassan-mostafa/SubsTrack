# Web — Staff (Users) Page — QA Scenarios

The **Staff** admin page on the desktop web app. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §5.8, §6, §7 and §9 on this page. The staff rules are the phone's: [../users.md](../users.md).

**Reference code:**

- Page: [UsersPage.tsx](Web/src/modules/admin/users/UsersPage.tsx), [UserFormDialog.tsx](Web/src/modules/admin/users/UserFormDialog.tsx)
- Page state: [usersTable.ts](Web/src/state/usersTable.ts)
- Server read: `findPage` in [UserRepository.ts](Shared/src/modules/admin/users/repository/UserRepository.ts) (search + shared-branch filter in ONE `or()`: `applyBranchAndSearch` in [BaseRepository.ts](Shared/src/core/utils/BaseRepository.ts); phone twin: [UserRepository.offline.ts](SubsTrack/src/modules/admin/users/repository/UserRepository.offline.ts))
- Who may do what: [userPermissions.ts](Shared/src/modules/admin/users/utils/userPermissions.ts) (`canEditUser`, `canManageUser`); username / password rules: [userRules.ts](Shared/src/modules/admin/users/utils/userRules.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project. Creating a user and changing a password call edge functions — the web is always online.

---

## 1. The list

| #   | Scenario             | Steps                                                         | Expected result                                                                                   |
| --- | -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1.1 | Columns              | Open Admin → Staff                                            | Name, Username (@…), Phone, Branch, Role, Status, ⋮                                               |
| 1.2 | Role pill            | Owner, an admin, a staff member                               | Violet "Super Admin" / indigo "Admin" / teal "Staff"                                              |
| 1.3 | Branch column        | Tenant with 2+ branches                                       | Branch name, or "Organization-wide admin" for a user with no branch                               |
| 1.4 | Search               | Type part of a full name, a username, a phone number          | Each finds the user                                                                               |
| 1.5 | Search + branch      | Header Branch → Beirut, then search "ali"                     | Only Beirut + organization-wide users named ali — the search does not bring in other branches     |
| 1.6 | Role filter          | Role → Admins / Staff                                         | Admins includes the owner; Staff only plain users                                                 |
| 1.7 | Status filter        | Status → Inactive                                             | Only deactivated users                                                                            |

## 2. Who may do what

| #   | Scenario                       | Steps                                                | Expected result                                                                         |
| --- | ------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2.1 | Own row                        | ⋮ on your own row                                    | Edit, History — no Deactivate, no Delete                                                |
| 2.2 | Admin on staff                 | Admin, ⋮ on a staff member                           | Edit, History, Deactivate, Delete                                                       |
| 2.3 | Admin on admin                 | Admin (not owner), ⋮ on another admin                | Edit, History only                                                                      |
| 2.4 | Owner on admin                 | Owner, ⋮ on an admin                                 | Edit, History, Deactivate, Delete                                                       |
| 2.5 | Branch admin, other branch     | Beirut admin, header shows all visible rows          | Organization-wide users are listed but their name is plain text (no link) and ⋮ has History only |
| 2.6 | Bulk, mixed                    | Tick yourself + 2 staff → Delete                     | Confirm says "Delete 2 staff members" and that 1 will be skipped                        |
| 2.7 | Bulk, none allowed             | Tick only yourself                                   | Bar has Edit only, no Delete                                                            |

## 3. Add and edit

| #    | Scenario                 | Steps                                                         | Expected result                                                                                   |
| ---- | ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 3.1  | Add staff                | Add staff member → username, full name, password ×2, Save     | Dialog closes; the new user can log in                                                            |
| 3.2  | Bad username             | Type "ali k"                                                  | Red helper under the field at once: only letters, numbers, dots and underscores                   |
| 3.3  | Short password           | Password "1234567"                                            | Red banner: password too short                                                                    |
| 3.4  | Passwords differ         | Different confirm                                             | Red helper under Confirm: "Passwords do not match"; nothing is sent                               |
| 3.5  | Username taken           | An existing username                                          | Red banner: the username exists                                                                   |
| 3.6  | Staff needs a branch     | Tenant with branches, role Staff, branch empty                | Red banner: staff need a branch                                                                   |
| 3.7  | Tenant-wide admin        | Role Admin                                                    | The branch field offers "Organization-wide admin"; Staff does not                                 |
| 3.8  | Change password          | Edit → tick Change Password → new password ×2 → Save         | Saved; the user logs in with the new password                                                     |
| 3.9  | Own role locked          | Edit yourself                                                 | Role buttons disabled with "Cannot change your own role"                                       |
| 3.10 | Owner role kept          | Edit the owner                                                | Role shows "Super Admin" only (disabled); saving keeps the owner role                             |
| 3.11 | Discard guard            | Run [app-shell.md](app-shell.md) §5 on this form              | As written there                                                                                  |

## 4. Deactivate and delete

| #   | Scenario                    | Steps                                          | Expected result                                                                      |
| --- | --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| 4.1 | Deactivate                  | ⋮ → Deactivate → confirm                       | Grey "Inactive" chip; the user can no longer log in                                  |
| 4.2 | Activate                    | ⋮ → Activate                                   | Green "Active"                                                                       |
| 4.3 | Delete, no payments         | Delete a user who never took money             | Row is gone (the account is removed)                                                 |
| 4.4 | Delete, has payments        | Delete a user who collected money              | Row stays as Inactive (kept for the money history)                                   |
