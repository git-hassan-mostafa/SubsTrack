# Customers — QA Scenarios

Covers the customer list, search/filter, customer detail (excluding the Monthly Grid which has its own file), and the create / edit / deactivate / reactivate flows. Customers can be touched by both `admin` and `user` roles unless noted.

**Reference code:**
- List screen: [CustomerListScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerListScreen.tsx)
- Detail screen: [CustomerDetailScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerDetailScreen.tsx)
- Form sheet: [CustomerFormSheet.tsx](SubsTrack/src/modules/customers/components/CustomerFormSheet.tsx)
- Card: [CustomerCard.tsx](SubsTrack/src/modules/customers/components/CustomerCard.tsx)
- Service: [CustomerService.ts](SubsTrack/src/modules/customers/services/CustomerService.ts)
- Store: [customerStore.ts](SubsTrack/src/modules/customers/store/customerStore.ts)

**Pagination:** PAGE_SIZE = 30 (see [constants/index.ts](SubsTrack/src/core/constants/index.ts)).
**Default sort:** by `name` ascending (server-side via `.order('name')`).

---

## 1. Customer list — render and counts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Tab badge | Tap the Customers tab | Title "Customers" shown, "<N> total" subtitle reflects current customer count |
| 1.2 | First load empty | Tenant has zero customers | Empty state: "No customers found" + "Tap '+ Add' to add your first customer" |
| 1.3 | First load with data | Tenant has ≥1 customer | Each customer rendered as a card: avatar (initials, color from name), name, plan name (or "No plan"), status pill (Paid / Unpaid / Inactive), current month label |
| 1.4 | Loading state | Pull-to-refresh on slow network | Spinner shown; list does not flicker. After load, list returns to scroll position |
| 1.5 | Refresh control color | Trigger refresh | Spinner color is primary indigo (#6366f1) |
| 1.6 | Active vs inactive sub-counts | List has 5 active and 2 inactive | Filter tabs show "All · 7", "Active · 5", "Inactive · 2" |
| 1.7 | Avatar color stability | Same customer name | Avatar background color is deterministic (charCode of first char modulo palette) — does not change across reloads |
| 1.8 | Initials computed correctly | Customer named "Mary Jane Smith" | Avatar shows "MJ" (first letters of first two whitespace-separated parts) |
| 1.9 | Single-name initials | Customer named "Madonna" | Avatar shows "MA" (first two characters, uppercased) |
| 1.10 | Long customer name | Name = "A very very very long customer business name LLC" | Card row truncates with ellipsis to one line; layout does not break |
| 1.11 | Status pill — paid this month | Active customer with non-voided payment in current billing month | Green "✓ Paid" pill |
| 1.12 | Status pill — unpaid this month | Active customer with no payment for current billing month | Red "Unpaid" pill |
| 1.13 | Status pill — inactive | Inactive customer (regardless of payment state) | Grey "Inactive" pill (overrides paid/unpaid) |
| 1.14 | Tab counts ignore search | Type a search term that matches 1 customer | Tab counts continue to show the unfiltered totals |

## 2. Customer list — search

Search is debounced (see [useDebounce.ts](SubsTrack/src/shared/hooks/useDebounce.ts)).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Search by name | Type partial customer name | List filters to matches (case-insensitive, substring) within the loaded pages |
| 2.2 | Search by phone | Type a phone fragment | Customers whose phone contains the substring appear |
| 2.3 | Search by address | Type an address fragment | Customers whose address contains the substring appear (case-insensitive) |
| 2.4 | No matches | Type a string that matches nothing | Empty state: "No customers found" + "Try a different search" sub-message |
| 2.5 | Clear search | Clear the search field | Full list returns immediately after debounce |
| 2.6 | Search ignores deactivated when "Active" tab selected | On Active tab, search by an inactive customer's name | No results — filter is applied AFTER the active filter |
| 2.7 | Search persists while typing | Type quickly | Last debounce wins; UI does not flicker per character |
| 2.8 | Pagination disabled while searching | Scroll to bottom while a search query is active | `fetchMoreCustomers` is NOT triggered (see `if (!debouncedSearch) fetchMoreCustomers()`) |
| 2.9 | Diacritics / Arabic search | Search with accented characters or Arabic | Substring match works on the raw name string |
| 2.10 | Phone with country code | Phone stored as `+1 555 0001`, search `5550001` | Does not match (search is exact substring of stored value) — confirm this is acceptable |

## 3. Customer list — filter tabs

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Default tab | Open Customers tab | "All" tab is selected |
| 3.2 | Switch to Active | Tap "Active" | List shows only active customers, count badge matches |
| 3.3 | Switch to Inactive | Tap "Inactive" | List shows only inactive customers |
| 3.4 | Tab + search combine | On Active tab, type a search term | Result is intersection: active AND matching the search |
| 3.5 | Tab persists during scroll | Scroll list, then scroll back | Active tab remains the same |
| 3.6 | Tab does NOT persist across navigation | Switch tab, leave Customers tab, come back | Tab resets to "All" (state is per-mount) |

## 4. Customer list — pagination & refresh

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Initial page size | Tenant has 60 customers | First load shows 30 |
| 4.2 | Auto-load next page | Scroll near the bottom | `loadingMore` spinner appears at the footer; next 30 append; spinner disappears |
| 4.3 | hasMore false | Total customers ≤ 30 | Reaching the bottom does NOT trigger more fetches |
| 4.4 | Pull-to-refresh | Pull down at top | Page resets to 0; first 30 reload; current month paid IDs refreshed |
| 4.5 | Refresh on focus | Leave Customers tab and come back | `fetchCustomers` is called via `useFocusEffect` |
| 4.6 | Pagination disabled during search | While typing a query | onEndReached is gated, see 2.8 |
| 4.7 | Network failure on refresh | Disable network, pull-to-refresh | ErrorBanner with the network message; existing list stays visible |
| 4.8 | Network failure on load-more | Disable network, scroll to bottom | ErrorBanner shown; loaded pages remain |

## 5. Add customer (create flow)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Open form | Tap "+ Add" | Modal sheet titled "Add Customer" slides up |
| 5.2 | Required fields | Open the form | Submit button disabled until Name and Start Date are non-blank |
| 5.3 | Cancel button | Tap "Cancel" | Sheet closes without persisting |
| 5.4 | Hardware back | On Android, press back while sheet open | Sheet closes (onRequestClose) |
| 5.5 | Submit minimal | Fill Name = "Alice", pick Start Date = today, leave others blank | Customer created. List re-renders with the new customer prepended (in-memory; will resort to alphabetical on next refresh) |
| 5.6 | Submit full | Fill Name, Phone, Address, pick Plan, pick Start Date | All fields persist. Plan join shows on the card |
| 5.7 | Plan dropdown — empty tenant | Tenant has zero plans | Dropdown shows the "No plan" option only |
| 5.8 | Plan dropdown — many plans | Tenant has plans | Each option shows plan name + sublabel ("$X / month" or "Custom pricing") |
| 5.9 | "No plan" selection | Pick "No plan" in the dropdown | planId saved as null |
| 5.10 | Start date in the future | Pick a date 3 months from now | Customer created; their grid will show every month before the start date as `before_start` (gray) |
| 5.11 | Start date in the past | Pick a date 2 years ago | Customer created; year navigator can scroll back to that year, but no further |
| 5.12 | Invalid YYYY-MM-DD via DatePicker | Picker should not allow malformed input | Service additionally validates `isValidDateString` — manual entry of bad string would error |
| 5.13 | Phone with spaces | Enter `+1 555 000 0000` | Stored as-typed (trim only, no normalization) |
| 5.14 | Empty Address allowed | Address blank | Stored as null |
| 5.15 | Whitespace-only Name | Enter "   " | Submit button stays disabled |
| 5.16 | Trim Name on save | Enter "  Alice  " | Stored as `"Alice"` |
| 5.17 | Form clears on reopen | Submit a customer, reopen form | All fields reset to blank/null |
| 5.18 | Network failure on create | Disable network, submit | ErrorBanner inside the sheet; sheet stays open with values intact |
| 5.19 | Loading on submit | Submit on slow network | Button shows loading state |
| 5.20 | Double-tap submit | Double-tap submit | Only one customer created (loading guards button) |
| 5.21 | Permission gating | Logged in as `user` role | "+ Add" button is still visible — staff CAN create customers (per spec). Verify creation succeeds |

## 6. Edit customer

Edit is launched only from the customer detail screen via the "Edit" button (admin only).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Edit visibility — admin | Open detail as admin | "Edit" button visible top right |
| 6.2 | Edit visibility — user | Open detail as user role | "Edit" button is HIDDEN (`isAdmin` gates it) |
| 6.3 | Open edit form | Tap Edit | Sheet titled "Edit Customer". Fields prefilled: Name, Phone, Address, Plan |
| 6.4 | Start date NOT editable | Look at the form when editing | Start Date field is HIDDEN in edit mode (only shown on create) |
| 6.5 | Change name | Update name and save | Customer updated. Card on list also re-renders to new name |
| 6.6 | Change plan to a fixed-price plan | Pick a different plan | New plan is displayed; existing payment amounts are NOT recomputed (they are snapshots) |
| 6.7 | Remove plan | Pick "No plan" | planId becomes null. Subsequent payments must use a custom amount |
| 6.8 | Edit phone to blank | Clear phone, save | phoneNumber stored as null |
| 6.9 | Edit address to blank | Clear address, save | address stored as null |
| 6.10 | Cancel preserves values | Type changes, tap Cancel | List/detail still shows original values |
| 6.11 | Network failure on edit | Disable network, save | ErrorBanner in sheet; original values still on detail screen |
| 6.12 | Edit loading state | Slow save | Button shows loading; double-tap does not trigger second save |

## 7. Customer detail — header & metadata

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Open detail | Tap a customer card | Detail screen pushes in: avatar, name, plan name (or "No plan"), "since <Mon Year>" |
| 7.2 | Back button | Tap back chevron | Returns to Customers list at previous scroll position |
| 7.3 | Phone row | Customer has phone | Row visible with phone icon and value |
| 7.4 | Phone row hidden | Customer has no phone | Phone row not rendered |
| 7.5 | Address row | Customer has address | Address row visible, value truncates to 2 lines |
| 7.6 | Started date | Display | Shows formatted start date (e.g. "Jan 5, 2024") |
| 7.7 | Status row | Tap "(tap)" | Confirm dialog opens (deactivate or reactivate) |
| 7.8 | Active status display | Customer is active | Green dot, "Active" |
| 7.9 | Inactive status display | Customer is inactive | Gray dot, "Inactive" |
| 7.10 | Refresh on focus | Pull-to-refresh on detail | Customer record re-fetched (plan, name, status updated if changed) |
| 7.11 | Resilience to deleted plan | Customer's plan is deleted by an admin in another session | After refresh, plan name shows "No plan", planId becomes null (DB sets null on plan delete) |

## 8. Year card / collected summary

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Default year | Open detail | Current year shown, e.g. "2026" |
| 8.2 | Counts | Look at the subtitle | "<paid> paid · <unpaid> unpaid · $<collected> collected" — values match the grid |
| 8.3 | Collected sum | Year contains 3 paid months @ $50 each | "$150 collected" |
| 8.4 | Collected ignores voids | A payment is voided | Collected total drops accordingly |
| 8.5 | Year navigator — back | Tap "‹" | Year decrements, grid refetches; cells render after spinner |
| 8.6 | Back disabled at start year | Year = customer's start_date year | "‹" button is at 30% opacity and disabled |
| 8.7 | Year navigator — forward | Tap "›" | Year increments freely (future years allowed) |
| 8.8 | Year switch refresh | Switch year on a slow connection | MonthGrid replaced by ActivityIndicator until fetch resolves |
| 8.9 | Voided payments hidden | Payments query filters voids | Grid does not show voided payments as paid |
| 8.10 | Cross-year navigation memory | Navigate to 2024, back to 2026 | Each fetch is independent — no stale grid leakage between years |

## 9. Unpaid banner (current month)

Banner is shown only when the customer's current month is unpaid AND the user is currently viewing the current year.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Banner appears | Active customer, current month unpaid, current year selected | Red ⚠️ banner: "<Month> <Year> unpaid", subtitle "$X due · N days into the month" or "Amount due · N days into the month" |
| 9.2 | Banner hidden when paid | Pay current month | Banner disappears |
| 9.3 | Banner hidden on past year | Navigate year back | Banner disappears (it is current-year only) |
| 9.4 | Banner hidden on future year | Navigate year forward | Banner not rendered |
| 9.5 | "Collect" CTA | Tap Collect button | Opens the Payment Form sheet for the current month |
| 9.6 | Banner with no plan | Customer has no plan | Subtitle reads "Amount due" (no $ amount) |
| 9.7 | Banner with custom-price plan | Plan is custom price | Subtitle reads "Amount due" |
| 9.8 | Days-into-month text | Banner subtitle | Uses today's calendar day-of-month |

## 10. Deactivate / reactivate

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Deactivate confirm | Tap status row on active customer | Dialog: "Deactivate Customer" with destructive (red) styling |
| 10.2 | Deactivate confirmed | Tap Confirm | active → false, cancelled_at = now(); status row updates to Inactive; grey "Inactive" pill on the list card |
| 10.3 | Deactivate cancel | Tap Cancel | No change |
| 10.4 | Reactivate confirm | Tap status row on inactive customer | Dialog: "Reactivate Customer" (non-destructive) |
| 10.5 | Reactivate confirmed | Tap Confirm | active → true, cancelled_at = null; pills/badges update |
| 10.6 | Inactive customer can still record current/past payments | Try to tap an unpaid past month for an inactive customer | Payment Form opens normally (catch-up arrears allowed) |
| 10.7 | Inactive customer CANNOT record future payments | Tap a future month on an inactive customer | Info popup: "This customer is inactive. Future month payments cannot be recorded for inactive customers." |
| 10.8 | Inactive does not delete payment history | Deactivate customer | All prior payments remain visible (no soft delete cascade) |
| 10.9 | Network failure on toggle | Disable network and confirm | ErrorBanner; status not toggled |

## 11. Permissions matrix

| Operation | Admin | User |
|-----------|-------|------|
| View list | ✓ | ✓ |
| Search/filter | ✓ | ✓ |
| Create customer | ✓ | ✓ |
| Open detail | ✓ | ✓ |
| Edit customer (button visible) | ✓ | ✗ |
| Deactivate / reactivate (status row tap) | ✓ | ✗ (status row tap is currently UI-only; verify edit gate) |
| Record payment | ✓ | ✓ |
| Void payment | ✓ | (gated by detail sheet — see payments.md) |

## 12. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Customer with no plan | Open detail | Header shows "No plan"; current-month banner shows "Amount due"; payment form requires manual amount |
| 12.2 | Plan deleted while detail is open | Admin deletes the plan in another session | Refresh customer → plan field becomes null. Existing payments still display amounts (snapshots) |
| 12.3 | Very long phone number | Phone = 50 chars | Stored, displayed (truncated visually if necessary) |
| 12.4 | Customer name special chars | Name with emojis or RTL characters | Renders correctly; avatar uses first character; initials may render unexpectedly for emoji — acceptable but verify no crash |
| 12.5 | Two customers same name | Create two customers with identical name | Both saved (no uniqueness constraint). Verify both appear in list separately |
| 12.6 | Customer ID in URL not found | Navigate to `/customers/<random-uuid>` | Detail shows error or blank state; back button works |
| 12.7 | Tenant change while a customer is open | Logout/login as another tenant via deeplink | The previous customer cannot be loaded (RLS denies) |
| 12.8 | Force-quit during create | Tap Save, kill app immediately | If the request reached the backend, customer exists; otherwise no record. Verify no duplicate on next launch |
| 12.9 | Pagination state on filter switch | Load 60 customers (page 0+1), switch to "Active" tab | Local filter applies to already-loaded pages; further pagination uses the unfiltered server list |
| 12.10 | Long search performance | 1000 customers loaded, search "a" | Filter remains responsive (string ops on JS arrays); confirm no UI freeze |
