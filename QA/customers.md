# Customers — QA Scenarios

Covers the customer list, search/filter (including the Unpaid tab), action menu (long-press or ⋮), Quick Pay shortcut, customer detail (excluding the Monthly Grid which has its own file), and the create / edit / deactivate / reactivate / delete flows.

Customers can be touched by both `admin` and `user` roles for view + create + edit + payment. Deactivate and **delete** are admin-only.

**Reference code:**

- List screen: [CustomerListScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerListScreen.tsx)
- Detail screen: [CustomerDetailScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerDetailScreen.tsx)
- Details card (status row + delete row + branch row + notes row): [CustomerDetailsCard.tsx](SubsTrack/src/modules/customers/components/CustomerDetailsCard.tsx)
- Form sheet: [CustomerFormSheet.tsx](SubsTrack/src/modules/customers/components/CustomerFormSheet.tsx)
- Card: [CustomerCard.tsx](SubsTrack/src/modules/customers/components/CustomerCard.tsx)
- Action menu: [ActionMenu.tsx](SubsTrack/src/shared/components/ActionMenu.tsx)
- Service: [CustomerService.ts](SubsTrack/src/modules/customers/services/CustomerService.ts)
- Store: [customerStore.ts](SubsTrack/src/modules/customers/store/customerStore.ts)

**Pagination:** PAGE_SIZE = 30 (see [constants/index.ts](SubsTrack/src/core/constants/index.ts)).
**Default sort:** by `name` ascending (server-side via `.order('name')`).
**Default tab on open:** "Active".

---

## 1. Customer list — render and counts

| #    | Scenario                       | Steps                                                      | Expected result                                                                                                                                                  |
| ---- | ------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Page header                    | Tap the Customers tab                                      | Title "Customers", "<N> total" subtitle (uses `totalCount`). "+ Add" button visible to both roles                                                                |
| 1.2  | BranchSelector chip            | Tenant-wide admin with ≥2 active branches                  | Chip rendered below PageHeader (see [branches.md](branches.md))                                                                                                  |
| 1.3  | First load empty               | Tenant has zero customers                                  | EmptyState "No customers found" + "Create First Customer" CTA when not searching                                                                                 |
| 1.4  | First load with data           | Tenant has ≥1 customer                                     | Each customer rendered as a card: avatar (initials, color from name), name, plan name (or "No plan"), status pill, current month label, ⋮ menu icon at the right |
| 1.5  | Loading state                  | Pull-to-refresh on slow network                            | Spinner; list does not flicker. After load, list returns to scroll position                                                                                      |
| 1.6  | Filter tabs                    | Look below search                                          | Four tabs in order: Active, Unpaid, All, Inactive                                                                                                                |
| 1.7  | Default tab is Active          | Open the screen                                            | "Active" tab selected by default                                                                                                                                 |
| 1.8  | Avatar color stability         | Same customer name                                         | Avatar color deterministic (charCode of first char modulo palette)                                                                                               |
| 1.9  | Initials computed correctly    | Customer "Mary Jane Smith"                                 | "MJ" (first letters of first two whitespace-separated parts)                                                                                                     |
| 1.10 | Single-name initials           | "Madonna"                                                  | "MA"                                                                                                                                                             |
| 1.11 | Long customer name             | Overflow                                                   | One line, ellipsis-truncated                                                                                                                                     |
| 1.12 | Status pill — inactive         | Inactive customer                                          | Gray "Inactive" pill (overrides everything else)                                                                                                                 |
| 1.13 | Status pill — non-regular      | Active customer with `isRegular = false`                   | Amber "Non-Regular" pill (overrides paid/unpaid)                                                                                                                 |
| 1.14 | Status pill — paid (regular)   | Active regular customer fully paid this month AND no unpaid past month | Green "✓ Paid" pill                                                                                                                                  |
| 1.15 | Status pill — unpaid (regular) | Active regular customer with no payment this month         | Red "Unpaid" pill                                                                                                                                                |
| 1.15a | Status pill — overdue past month | Active regular customer with current month paid (or partial) BUT any earlier month past its grace window unpaid | Red "Unpaid" pill (overdue past month overrides a paid/partial current month) |
| 1.16 | Long-press opens menu          | Long-press on a card                                       | ActionMenu opens (same as ⋮ tap)                                                                                                                                 |
| 1.17 | Tap menu icon                  | Tap ⋮ on a card                                            | ActionMenu opens                                                                                                                                                 |

## 2. Search

Search is debounced (see [useDebounce.ts](SubsTrack/src/shared/hooks/useDebounce.ts)) and runs server-side via the customer repository.

| #   | Scenario                                 | Steps                                     | Expected result                                                |
| --- | ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| 2.1 | Search by name                           | Type partial customer name                | List filters to matches (case-insensitive substring)           |
| 2.2 | Search by phone                          | Type a phone fragment                     | Matches by phone                                               |
| 2.3 | Search by address                        | Type an address fragment                  | Matches by address                                             |
| 2.4 | Search by area                           | Type an area fragment (e.g. "Hamra")      | Matches by area (area field is searchable per CLAUDE.md)       |
| 2.5 | No matches                               | Type a string that matches nothing        | EmptyState "No customers found" + sub "Try a different search" |
| 2.6 | Clear search                             | Clear the search field                    | Full list returns after debounce                               |
| 2.7 | Search + tab combine                     | On Active tab, type a search term         | Intersection: active AND match                                 |
| 2.8 | Search ignores debounce when typing fast | Type quickly                              | Last debounce wins; no per-character flicker                   |
| 2.9 | Diacritics / Arabic search               | Search with accented characters or Arabic | Substring match on raw value                                   |

## 3. Filter tabs

| #   | Scenario                               | Steps                                   | Expected result                                                                                       |
| --- | -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 3.1 | Active tab                             | Tap "Active"                            | Only active customers (irrespective of regular/non-regular)                                           |
| 3.2 | Unpaid tab                             | Tap "Unpaid"                            | Active REGULAR customers that either have no payment this month OR have any unpaid past month (overdue). Non-regular customers excluded |
| 3.3 | All tab                                | Tap "All"                               | All customers                                                                                         |
| 3.4 | Inactive tab                           | Tap "Inactive"                          | Only inactive customers                                                                               |
| 3.5 | Tab + search combine                   | On any tab, type                        | Filter applied to the tab's set                                                                       |
| 3.6 | Tab persists during scroll             | Scroll list, scroll back                | Active tab unchanged                                                                                  |
| 3.7 | Tab does NOT persist across navigation | Switch tab, leave Customers tab, return | Tab resets to default "Active" (state is per-mount)                                                   |

## 4. Pagination & refresh

| #   | Scenario                     | Steps                             | Expected result                                                     |
| --- | ---------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| 4.1 | Initial page size            | Tenant has 60 customers           | First load shows 30                                                 |
| 4.2 | Auto-load next page          | Scroll near the bottom            | `loadingMore` spinner appears; next 30 append                       |
| 4.3 | hasMore false                | Total ≤ 30                        | Reaching the bottom does NOT fetch more                             |
| 4.4 | Pull-to-refresh              | Pull down at top                  | Page resets to 0; first 30 reload; current-month paid IDs refreshed |
| 4.5 | Refresh on focus             | Leave and return                  | `fetchCustomers` called via `useFocusEffect` / mount effect         |
| 4.6 | Branch chip switch refetch   | Switch BranchSelector             | Customer list re-fetches for the new scope                          |
| 4.7 | Network failure on refresh   | Disable network, pull-to-refresh  | ErrorBanner; existing list stays visible                            |
| 4.8 | Network failure on load-more | Disable network, scroll to bottom | ErrorBanner; loaded pages remain                                    |

## 5. Add customer (create flow)

| #    | Scenario                                      | Steps                                                                              | Expected result                                                                                                              |
| ---- | --------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Open form                                     | Tap "+ Add"                                                                        | Sheet "Add Customer"                                                                                                         |
| 5.2  | Required fields marked with asterisk          | Look at labels                                                                     | Name and Start Date have "\*"                                                                                                |
| 5.3  | Submit disabled when blank                    | Open the form                                                                      | Submit disabled until Name and Start Date are non-blank                                                                      |
| 5.4  | Branch picker — visibility                    | Tenant-wide admin in multi-branch tenant                                           | Branch picker shown, `nullable = false`. Defaults to currently-selected branch in BranchSelector (or null if All/Unassigned) |
| 5.5  | Branch picker — auto-bind                     | Branch-scoped admin OR single-branch tenant                                        | No branch picker shown; saved with branch_id = admin's branch (or the only branch)                                           |
| 5.6  | Branch required when tenant has branches      | Tenant has ≥1 branch, branch left blank by tenant-wide admin                       | Submit disabled with hint; service rejects                                                                                   |
| 5.7  | Branch optional when tenant has zero branches | Legacy 0-branch tenant                                                             | No branch picker; saved with `branch_id = NULL`                                                                              |
| 5.8  | Plan dropdown — filtered by branch            | Form open with branch = Beirut                                                     | Plan dropdown shows shared plans + Beirut plans only                                                                         |
| 5.9  | Plan dropdown — none                          | Tenant has zero plans                                                              | "No plan" option only                                                                                                        |
| 5.10 | "No plan" selection                           | Pick "No plan"                                                                     | planId saved as null                                                                                                         |
| 5.11 | Cancel button                                 | Tap Cancel                                                                         | Sheet closes without persisting                                                                                              |
| 5.12 | Hardware back                                 | Android back                                                                       | Sheet closes                                                                                                                 |
| 5.13 | Submit minimal                                | Fill Name + Start Date, save                                                       | Customer created. Defaults: `isRegular = true`, `active = true`                                                              |
| 5.14 | Submit full                                   | Fill Name, Phone, Address, Area, Notes, Plan, Start Date, Branch, isRegular toggle | All fields persist                                                                                                           |
| 5.15 | isRegular toggle default                      | Open the form                                                                      | Toggle ON (regular) by default                                                                                               |
| 5.16 | isRegular toggle OFF                          | Toggle off, save                                                                   | `is_regular = false`. Card shows amber "Non-Regular" pill                                                                    |
| 5.17 | Start date in the future                      | Pick date 3 months from now                                                        | Created; grid shows every month before start date as `before_start`                                                          |
| 5.18 | Start date in the past                        | Pick date 2 years ago                                                              | Created; year navigator scrolls back to that year, not further                                                               |
| 5.19 | Phone with spaces                             | "+1 555 000 0000"                                                                  | Stored as-typed (trim only)                                                                                                  |
| 5.20 | Empty Address allowed                         | Address blank                                                                      | Stored as null                                                                                                               |
| 5.21 | Empty Area allowed                            | Area blank                                                                         | Stored as null                                                                                                               |
| 5.22 | Empty Notes allowed                           | Notes blank                                                                        | Stored as null                                                                                                               |
| 5.23 | Whitespace-only Name                          | " "                                                                                | Submit disabled                                                                                                              |
| 5.24 | Trim Name on save                             | " Alice "                                                                          | Stored as "Alice"                                                                                                            |
| 5.25 | Form clears on reopen                         | Submit, reopen form                                                                | All fields reset                                                                                                             |
| 5.26 | Network failure                               | Disable network, submit                                                            | ErrorBanner inside the sheet; sheet stays open with values intact                                                            |
| 5.27 | Loading on submit                             | Submit on slow network                                                             | Button shows loading state                                                                                                   |
| 5.28 | Double-tap submit                             | Double-tap                                                                         | Only one customer created (loading guard)                                                                                    |
| 5.29 | Permission — user role can create             | Logged in as user                                                                  | "+ Add" visible and create succeeds                                                                                          |

## 6. Edit customer

Launched from the action menu (Edit item). Available to both admin and user roles.

| #    | Scenario                        | Steps                                      | Expected result                                                                                                            |
| ---- | ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 6.1  | Edit menu item visible — admin  | Open menu                                  | "Edit" visible                                                                                                             |
| 6.2  | Edit menu item visible — user   | Open menu as user                          | "Edit" visible (both roles can edit)                                                                                       |
| 6.3  | Open edit form                  | Tap Edit                                   | Sheet "Edit Customer". Fields prefilled: Name, Phone, Address, Area, Notes, Plan, isRegular, Branch (if tenant-wide admin) |
| 6.4  | Start date NOT editable         | Look at the form                           | Start Date field HIDDEN in edit mode                                                                                       |
| 6.5  | Change name                     | Update name and save                       | Customer updated. Card re-renders                                                                                          |
| 6.6  | Change plan to fixed-price plan | Pick a different plan                      | New plan displayed. Existing payment amounts UNCHANGED (snapshots)                                                         |
| 6.7  | Remove plan                     | Pick "No plan"                             | planId becomes null                                                                                                        |
| 6.8  | Toggle isRegular                | Flip the switch                            | Customer's status pill updates immediately. Unpaid tab membership changes accordingly                                      |
| 6.9  | Change branch                   | Tenant-wide admin picks a different branch | branch_id updated. Customer moves between branch scopes                                                                    |
| 6.10 | Edit phone to blank             | Clear phone, save                          | phone null                                                                                                                 |
| 6.11 | Edit area to blank              | Clear area, save                           | area null                                                                                                                  |
| 6.12 | Edit notes to blank             | Clear notes, save                          | notes null                                                                                                                 |
| 6.13 | Cancel preserves values         | Type changes, tap Cancel                   | List/detail still shows originals                                                                                          |
| 6.14 | Network failure on edit         | Disable network, save                      | ErrorBanner in sheet                                                                                                       |
| 6.15 | Edit loading state              | Slow save                                  | Button shows loading; double-tap guarded                                                                                   |

## 7. Action menu (long-press or ⋮)

`ActionMenu` is the modal sheet with up to four items depending on context.

| #   | Scenario                        | Steps                  | Expected result                                            |
| --- | ------------------------------- | ---------------------- | ---------------------------------------------------------- |
| 7.1 | Open via ⋮                      | Tap ⋮ icon             | Menu opens with the customer's name as title               |
| 7.2 | Open via long-press             | Long-press on the card | Menu opens                                                 |
| 7.3 | Dismiss menu                    | Tap outside / back     | Menu closes                                                |
| 7.4 | Item order                      | Inspect                | Quick Pay (if applicable) → Edit → Toggle Active → Delete  |
| 7.5 | Edit item always shown          | Any customer           | "Edit" item appears                                        |
| 7.6 | Toggle Active item — admin only | Open menu as admin     | "Deactivate" (if active) or "Activate" (if inactive) shown |
| 7.7 | Toggle Active item — user role  | Open menu as user      | Item HIDDEN                                                |
| 7.8 | Delete item — admin only        | Open menu as admin     | "Delete" (destructive) shown                               |
| 7.9 | Delete item — user role         | Open menu as user      | Item HIDDEN                                                |

## 8. Quick Pay (one-tap current month)

Available from the action menu. Hidden if customer is inactive, non-regular, already paid current month, or current month is before start date.

| #    | Scenario                                       | Steps                                                                | Expected result                                                                                                     |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 8.1  | Quick Pay visibility                           | Active regular customer, not yet paid this month, start_date ≤ today | "Pay Now" item visible in the menu                                                                                  |
| 8.2  | Quick Pay hidden — inactive                    | Inactive customer                                                    | Hidden                                                                                                              |
| 8.3  | Quick Pay hidden — non-regular                 | `isRegular = false`                                                  | Hidden                                                                                                              |
| 8.4  | Quick Pay hidden — already paid                | Paid this month                                                      | Hidden                                                                                                              |
| 8.5  | Quick Pay hidden — before start date           | start_date > today                                                   | Hidden                                                                                                              |
| 8.6  | Quick Pay Scenario A (fixed single-month plan) | Customer on fixed 1-month plan, tap Pay Now                          | Payment created directly: `amount_due = amount_paid = plan.price`. Cell turns green. Card pill switches to "✓ Paid" |
| 8.7  | Quick Pay Scenario D (multi-month plan)        | Customer on a 3-month plan                                           | `ConfirmDialog`: "Pay <amount> covering <Jan–Mar 2026>?"                                                            |
| 8.8  | Confirm multi-month Quick Pay                  | Tap Confirm                                                          | createMultiMonthPayment runs. All 3 cells become paid in one operation                                              |
| 8.9  | Cancel multi-month Quick Pay                   | Tap Cancel                                                           | No payment recorded                                                                                                 |
| 8.10 | Quick Pay Scenario C (custom/no plan)          | Customer has no plan or custom-price plan                            | Navigates to `customers/[id]?quickPay=1`; detail screen auto-opens PaymentFormSheet for current month               |
| 8.11 | Quick Pay loading state                        | Slow network                                                         | Menu icon on the card shows spinner; double-tap guarded                                                             |
| 8.12 | Quick Pay error                                | Disable network, Quick Pay                                           | ErrorBanner; menu closes; no payment created                                                                        |

## 9. Customer detail — header & metadata

| #    | Scenario                      | Steps                                             | Expected result                                                                    |
| ---- | ----------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 9.1  | Open detail                   | Tap a customer card                               | Detail screen pushes in: avatar, name, plan, "since <Mon Year>"                    |
| 9.2  | Back button                   | Tap back chevron                                  | Returns to list at previous scroll position                                        |
| 9.3  | Phone row                     | Customer has phone                                | Row with phone icon + value                                                        |
| 9.4  | Phone row hidden              | No phone                                          | Row not rendered                                                                   |
| 9.5  | Branch row                    | Customer has branch (and branch is in store)      | Row shows branch name (added per "branch name under customer details page" commit) |
| 9.6  | Branch row hidden             | Customer has `branch_id = NULL` OR branch deleted | Row not rendered                                                                   |
| 9.7  | Address row                   | Customer has address                              | Row visible, value truncates to 2 lines                                            |
| 9.8  | Area row                      | Customer has area                                 | Row visible with map icon                                                          |
| 9.9  | Started row                   | Always                                            | Formatted start date (e.g. "Jan 5, 2024")                                          |
| 9.10 | Notes row                     | Customer has notes                                | Row with document icon, full notes text rendered below the label (multi-line)      |
| 9.11 | Notes row hidden              | No notes                                          | Not rendered                                                                       |
| 9.12 | Status row                    | Tap                                               | Confirm dialog opens (admin only — no chevron for user role)                       |
| 9.13 | Active status display         | Active                                            | Green dot, "Active", admin-only chevron                                            |
| 9.14 | Inactive status display       | Inactive                                          | Amber dot, "Inactive", admin-only chevron                                          |
| 9.15 | Delete row — admin only       | Logged in as admin                                | "Delete" row in red at the bottom of the card                                      |
| 9.16 | Delete row — user role hidden | Logged in as user                                 | Delete row NOT shown                                                               |
| 9.17 | Refresh on focus              | Pull-to-refresh                                   | Customer record refetched                                                          |
| 9.18 | Resilience to deleted plan    | Plan deleted by another session                   | After refresh, plan name shows "No plan", planId = null                            |

## 10. Year card / collected summary (single source: CustomerPaymentPanel)

| #     | Scenario                            | Steps                             | Expected result                                                                                         |
| ----- | ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 10.1  | Default year                        | Open detail                       | Current year shown                                                                                      |
| 10.2  | Counts                              | Look at the subtitle              | "<paid> paid · <unpaid> unpaid · <collected> collected"                                                 |
| 10.3  | Collected sum in display currency   | Mixed-currency payments           | Total = sum of USD equivalents (via each payment's snapshot rate), formatted in user's display currency |
| 10.4  | Collected ignores voids             | A payment is voided               | Collected drops accordingly                                                                             |
| 10.5  | Collected ignores `amount_paid = 0` | A payment with amount_paid = 0    | Excluded from collected total                                                                           |
| 10.6  | Year navigator — back               | Tap "<"                           | Year decrements, grid refetches                                                                         |
| 10.7  | Back disabled at start year         | Year = customer's start_date year | Disabled at 30% opacity                                                                                 |
| 10.8  | Forward                             | Tap "›"                           | Year increments freely                                                                                  |
| 10.9  | Year switch refresh                 | Switch year on slow connection    | MonthGrid replaced by spinner until fetch resolves                                                      |
| 10.10 | Cross-year navigation memory        | Navigate to 2024, back to 2026    | Each fetch independent                                                                                  |

## 11. Unpaid banner (current month)

Banner is shown only when current month is unpaid AND user is on the current year AND customer is REGULAR.

| #    | Scenario                      | Steps                                                       | Expected result                                                      |
| ---- | ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 11.1 | Banner appears                | Active regular customer, current month unpaid, current year | Red ⚠️ banner with "<Month> <Year> unpaid", subtitle with amount due |
| 11.2 | Banner hidden when paid       | Pay current month                                           | Banner disappears                                                    |
| 11.3 | Banner hidden on past year    | Navigate back                                               | Banner disappears                                                    |
| 11.4 | Banner hidden on future year  | Navigate forward                                            | Banner not rendered                                                  |
| 11.5 | Banner hidden for non-regular | Non-regular customer                                        | Banner NEVER shown                                                   |
| 11.6 | "Collect" CTA                 | Tap Collect                                                 | Opens PaymentFormSheet for current month                             |
| 11.7 | Banner with no plan           | Subtitle reads "Amount due" (no specific amount)            |
| 11.8 | Banner with custom-price plan | Same as no-plan                                             |

## 12. Deactivate / reactivate (admin only)

Reachable from the action menu and from the status row in the details card.

| #    | Scenario                                      | Steps                    | Expected result                                                                                     |
| ---- | --------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 12.1 | Deactivate confirm                            | Tap toggle               | ConfirmDialog with destructive (red) styling, message "Deactivate <name>?"                          |
| 12.2 | Deactivate confirmed                          | Tap Confirm              | active → false, cancelled_at = now(). Pill switches to gray "Inactive"                              |
| 12.3 | Deactivate cancel                             | Tap Cancel               | No change                                                                                           |
| 12.4 | Reactivate                                    | Tap toggle on inactive   | ConfirmDialog non-destructive, "Reactivate <name>?". On Confirm: active → true, cancelled_at = null |
| 12.5 | Inactive — payment recording for past/current | Tap an unpaid past month | PaymentFormSheet opens normally (catch-up allowed)                                                  |
| 12.6 | Inactive — payment recording for future       | Tap a future month       | Form opens but submit blocked with amber banner "Customer is inactive..."                           |
| 12.7 | Inactive does not delete payment history      | Deactivate               | Prior payments still visible                                                                        |
| 12.8 | Network failure                               | Disable network, confirm | ErrorBanner; status not toggled                                                                     |

## 13. Delete customer (admin only)

Smart soft/hard via `customerStore.deleteCustomer` — returns `'soft'` or `'hard'`. Soft when the customer has any payments (to preserve history); hard when none.

| #    | Scenario                      | Steps                                   | Expected result                                                                                                                                                        |
| ---- | ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.1 | Delete from menu — admin      | Action menu → Delete                    | ConfirmDialog destructive, message "Delete <name>? This cannot be undone."                                                                                             |
| 13.2 | Delete from details card      | Tap "Delete" row on detail              | Same dialog                                                                                                                                                            |
| 13.3 | Confirm delete — no payments  | Customer with no payment history        | Hard delete: row removed from DB. Returns to list. List re-renders without the customer                                                                                |
| 13.4 | Confirm delete — has payments | Customer with at least one payment      | Soft delete: customer marked inactive + cancelled_at = now(). Payment history preserved. List re-renders with the customer hidden (active filter) or shown as Inactive |
| 13.5 | Cancel                        | Tap Cancel                              | No change                                                                                                                                                              |
| 13.6 | Delete row hidden — user role | Logged in as user                       | Delete row not shown in details; menu also omits Delete                                                                                                                |
| 13.7 | Network error                 | Disable network, confirm                | ErrorBanner; customer not deleted                                                                                                                                      |
| 13.8 | After hard delete navigate    | When result === 'hard' on detail screen | Auto-navigates back via `onDeleted` callback                                                                                                                           |

## 14. Permissions matrix

| Operation                         | Admin | User                                              |
| --------------------------------- | ----- | ------------------------------------------------- |
| View list                         | ✓     | ✓                                                 |
| Search / filter                   | ✓     | ✓                                                 |
| Create customer                   | ✓     | ✓                                                 |
| Open detail                       | ✓     | ✓                                                 |
| Edit customer                     | ✓     | ✓                                                 |
| Quick Pay                         | ✓     | ✓                                                 |
| Record payment from detail        | ✓     | ✓                                                 |
| Toggle active (menu / status row) | ✓     | ✗                                                 |
| Delete customer                   | ✓     | ✗                                                 |
| Void payment                      | ✓     | ⚠ Verify (see [payments.md § 10.13](payments.md)) |

## 15. Edge cases

| #     | Scenario                                 | Steps                                                | Expected result                                                                                                     |
| ----- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 15.1  | Customer with no plan                    | Open detail                                          | Header shows "No plan"; current-month banner shows "Amount due"; payment form requires manual amount                |
| 15.2  | Plan deleted while detail is open        | Refresh customer                                     | plan field becomes null. Existing payments still display amounts (snapshots)                                        |
| 15.3  | Very long phone number                   | 50 chars                                             | Stored, displayed (truncated visually if necessary)                                                                 |
| 15.4  | Name special chars / emoji               | Renders correctly; avatar uses first character       |
| 15.5  | Two customers same name                  | Both saved (no uniqueness constraint)                |
| 15.6  | Customer ID in URL not found             | Navigate to `/customers/<random-uuid>`               | Detail shows error or blank state; back works                                                                       |
| 15.7  | Tenant change while a customer is open   | Login as another tenant                              | The previous customer cannot be loaded (RLS denies)                                                                 |
| 15.8  | Force-quit during create                 | Tap Save, kill app                                   | No duplicate on next launch                                                                                         |
| 15.9  | Long search performance                  | 1000 customers loaded, search "a"                    | Filter responsive; no UI freeze                                                                                     |
| 15.10 | Customer with branch then branch deleted | Branch FK `ON DELETE SET NULL`                       | Customer's branch_id becomes null; row visible only to tenant-wide admins. Branch row hidden in details card        |
| 15.11 | RTL display                              | Switch to Arabic                                     | List, card, menu, form all render RTL                                                                               |
| 15.12 | isRegular toggled mid-month              | Customer was unpaid + regular, toggle to non-regular | Card pill switches to "Non-Regular"; Unpaid tab membership flips; dashboard unpaid count recomputed on next refresh |
