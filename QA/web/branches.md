# Web — Data Table & Branches Page — QA Scenarios

Covers the web app's shared data table (server paging, search, filter, empty states, row menu, checkbox selection + bulk bar, CSV export), the record history dialog, and the **Branches** page, which is the first page built on them. Every later web list copies this page, so run these once per new list. The branch rules are the phone's: [../branches.md](../branches.md). The form dialog itself is covered in [app-shell.md](app-shell.md) §5 — run it on the Branches form.

**Reference code:**

- Table: [DataTable.tsx](Web/src/shared/table/DataTable.tsx), [RowActionsMenu.tsx](Web/src/shared/table/RowActionsMenu.tsx), [BulkActionBar.tsx](Web/src/shared/table/BulkActionBar.tsx), [useTableExport.tsx](Web/src/shared/table/useTableExport.tsx), [SearchField.tsx](Web/src/shared/components/SearchField.tsx)
- Page state: [createPagedStore.ts](Web/src/state/createPagedStore.ts), [branchesTable.ts](Web/src/state/branchesTable.ts)
- Page: [BranchesPage.tsx](Web/src/modules/admin/branches/BranchesPage.tsx), [BranchFormDialog.tsx](Web/src/modules/admin/branches/BranchFormDialog.tsx)
- History: [RecordHistoryDialog.tsx](Web/src/modules/admin/audit/RecordHistoryDialog.tsx)
- Server read: `findPage` in [BranchRepository.ts](Shared/src/modules/admin/branches/repository/BranchRepository.ts)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project. Sign in as an organization-wide admin. For paging tests the tenant needs 30+ branches.

---

## 1. Loading and paging

| #   | Scenario                     | Steps                                                  | Expected result                                                                                                     |
| --- | ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1.1 | First open                   | Open Admin → Branches                                  | A thin progress bar, then the rows. No "No branches yet" flash before the rows arrive                                 |
| 1.2 | Order                        | Look at the list                                       | Active branches first, then inactive; A→Z by name inside each group — the same order as the phone                    |
| 1.3 | Page footer                  | 30+ branches                                           | Footer shows "Rows per page" (25 / 50 / 100) and "1–25 of N"; N is the real total                                     |
| 1.4 | Next page                    | Press the next-page arrow                              | Rows 26–50 load; the old rows stay under a progress bar while loading (no blank table, no jump back to page 1)       |
| 1.5 | Page size                    | Pick 50                                                | Goes back to page 1 and shows 50 rows                                                                                |
| 1.6 | Only one page is fetched     | DevTools Network, change page                          | One `branches` request per page, with `offset`/`limit` and a `Prefer: count=exact` header — never the whole table    |
| 1.7 | Coming back keeps the view   | Search "a", go to page 2, open Customers, come back    | Same search, same filter, same page (then it refreshes)                                                              |
| 1.8 | Deleting the last row of a page | On the last page with one row, delete that branch   | The table steps back to the previous page instead of showing an empty page                                           |
| 1.9 | Load error                   | Go offline in DevTools, change page                    | Red banner with the friendly connection message and a "Try again" button; pressing it (back online) loads the page   |
| 1.10 | No column sorting           | Click a column header                                  | Nothing sorts (the order is the server's); no column menu                                                             |

## 2. Search and filter

| #   | Scenario                     | Steps                                                  | Expected result                                                                                     |
| --- | ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 2.1 | Search                       | Type part of a branch name                             | After a short pause the list shows only matching branches, from page 1; upper/lower case does not matter |
| 2.2 | Fast typing                  | Type "beirut" quickly                                  | One request after you stop, not one per letter; no letters lost                                      |
| 2.3 | Special characters           | Search `%`, `(`, `,`                                   | No error banner; those characters are ignored                                                        |
| 2.4 | Clear the box                | Press the X in the search box                          | The full list comes back                                                                             |
| 2.5 | Status filter                | Status → Inactive, then Active, then All               | Only inactive / only active / everything                                                             |
| 2.6 | No matches                   | Search "zzzz"                                          | "No results" with "Try another search or clear the filters." and a "Clear filters" button (no "Add" button) |
| 2.7 | Clear filters                | In 2.6 press Clear filters                             | Search box empties, Status goes back to All, all rows show                                            |

## 3. Empty tenant

| #   | Scenario           | Steps                                   | Expected result                                                                                   |
| --- | ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 3.1 | No branches at all | Tenant with zero branches               | "No branches yet", "Add your first branch to get started." and an "Add branch" button that opens the form |

## 4. Add and edit (form dialog)

| #   | Scenario             | Steps                                                  | Expected result                                                                                           |
| --- | -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 4.1 | Add                  | Press "Add branch", type a name, Save                  | Dialog closes; the list reloads with the new branch in its sorted place; the header Branch selector lists it too (if shown) |
| 4.2 | Empty name           | Add, leave the name empty, Save                        | Red banner in the dialog: the name is required. Save is never greyed out                                  |
| 4.3 | Duplicate name       | Add a name that already exists                         | Red banner: the name already exists; dialog stays open with the text                                      |
| 4.4 | 60 characters max    | Paste a 70-character name                              | The field stops at 60                                                                                     |
| 4.5 | Typing clears error  | After 4.3, type a letter                               | The banner goes away                                                                                      |
| 4.6 | Edit from the name   | Click a branch name in the table                       | "Edit Branch" dialog with the name filled in; "Save Changes" saves and the row updates                    |
| 4.7 | Edit an inactive one | Open an inactive branch                                | Amber note: hidden because records still use it; reactivate to use it again                               |
| 4.8 | Discard guard        | Run [app-shell.md](app-shell.md) §5 on this form       | As written there                                                                                          |

## 5. Row menu

| #   | Scenario                | Steps                                                         | Expected result                                                                                             |
| --- | ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 5.1 | Menu items and order    | Press ⋮ on an active branch                                   | Edit, History, Deactivate (red), Delete (red) — in that order, same as the phone                              |
| 5.2 | Inactive branch         | Press ⋮ on an inactive branch                                 | Edit, History, Reactivate, Delete                                                                             |
| 5.3 | Deactivate              | Deactivate a branch (used or not used)                        | Confirm "Deactivate Branch"; after OK the row shows the grey "Inactive" chip and moves down with the inactive ones. An unused branch is NOT removed — deactivate only hides |
| 5.4 | Delete an unused branch | Delete a branch nothing uses                                  | Confirm "Delete Branch"; the row is gone                                                                      |
| 5.5 | Delete a used branch    | Delete a branch customers use                                 | It becomes Inactive instead (kept for history), as on the phone                                               |
| 5.6 | Last active branch      | Try to deactivate or delete the only active branch            | Red banner above the table: at least one active branch is needed                                              |
| 5.7 | Reactivate              | Reactivate an inactive branch                                 | Green "Active" chip; it moves up with the active ones                                                         |
| 5.8 | Keyboard                | Tab into the table, arrow to the ⋮ cell, press Enter          | The menu opens; arrows move; Enter runs; Esc closes. Screen reader names the button "Actions for <branch>"   |

## 6. Selection and bulk bar

| #   | Scenario                  | Steps                                              | Expected result                                                                                   |
| --- | ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 6.1 | Tick one                  | Tick one row                                       | The search/filter bar turns into "1 selected" with Edit, Deactivate/Reactivate, Delete, and an X    |
| 6.2 | Tick several              | Tick 3 rows                                        | "3 selected" with Delete only                                                                     |
| 6.3 | Select all                | Tick the header box                                | Only the rows on this page are selected                                                           |
| 6.4 | Bulk delete               | Delete 3 (one used by customers)                   | Confirm "Delete 3 branches"; unused ones disappear, the used one turns Inactive; the selection clears |
| 6.5 | Clear                     | Press X in the bar                                 | Nothing selected; the search/filter bar is back                                                   |
| 6.6 | Page change drops it      | Tick rows, go to the next page                     | Nothing selected on the new page, and the bar is gone                                             |
| 6.7 | Clicking a row            | Click an empty part of a row                       | Does not tick it (only the checkbox does)                                                         |

## 7. Export

| #   | Scenario             | Steps                                           | Expected result                                                                                              |
| --- | -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 7.1 | One page only        | Fewer branches than the page size; press the download icon | A file "Branches-YYYY-MM-DD.csv" downloads at once; opens in Excel with readable columns (Name, Active …), Arabic names correct |
| 7.2 | More than one page   | 30+ branches, page size 25; press the icon       | A menu: "Only this page (25)" and "All matching rows (N)"                                                      |
| 7.3 | All matching rows    | Search "a", then All matching rows              | The file has every branch matching "a", across all pages — not only the visible 25                             |
| 7.4 | Staff user           | (Branches is admin-only, so check on a later list) | No download icon for a non-admin                                                                            |

## 8. History dialog

| #   | Scenario         | Steps                                    | Expected result                                                                                   |
| --- | ---------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 8.1 | Open             | ⋮ → History on a renamed branch          | "Change history" with the branch name under it; each change as a sentence (names in bold) with its date and time, newest first |
| 8.2 | Never changed    | History on a new branch                  | The "created" entry only, or "No changes recorded" if the audit log started later                 |
| 8.3 | Close            | Close button, Esc, or a click outside    | Closes                                                                                            |

## 9. After log out

| #   | Scenario        | Steps                                                          | Expected result                                                                   |
| --- | --------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 9.1 | No leftovers    | Search on Branches, log out, sign in to ANOTHER organization, open Branches | Empty search, All filter, page 1, and only the new organization's branches — never the old ones, not even for a moment |
