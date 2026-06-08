# Sales — QA Scenarios

Covers the one-off sales ledger: recording a sale against an optional customer, viewing the sales list, the sale receipt, voiding a sale, and the per-customer sales panel. Sales are a completely separate ledger from subscription payments — they share no schema or service code beyond the snapshot-rate principle.

**Reference code:**
- Screen: [SalesListScreen.tsx](SubsTrack/src/modules/sales/screens/SalesListScreen.tsx)
- Form sheet: [SaleFormSheet.tsx](SubsTrack/src/modules/sales/components/SaleFormSheet.tsx)
- Detail sheet: [SaleDetailSheet.tsx](SubsTrack/src/modules/sales/components/SaleDetailSheet.tsx)
- Card: [SaleCard.tsx](SubsTrack/src/modules/sales/components/SaleCard.tsx)
- Customer panel: [CustomerSalesPanel.tsx](SubsTrack/src/modules/sales/components/CustomerSalesPanel.tsx)
- Service: [SaleService.ts](SubsTrack/src/modules/sales/services/SaleService.ts)
- Repository: [SaleRepository.ts](SubsTrack/src/modules/sales/repository/SaleRepository.ts)
- Customer picker: [AsyncEntityPicker.tsx](SubsTrack/src/shared/components/AsyncEntityPicker.tsx)
- Route: [sales/index.tsx](SubsTrack/app/(app)/(tabs)/sales/index.tsx)
- Dashboard service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Currency utils: [currency.ts](SubsTrack/src/core/utils/currency.ts)

---

## 0. Critical invariants

1. **Sales and subscription payments are completely separate.** Different tables, different services, different slices. The only shared concept is the snapshot-rate principle.
2. **Snapshots are frozen at sale time.**
   - `product_name_snapshot` — frozen product name, survives renames and soft-deletes.
   - `unit_amount` — frozen price at sale time (defaults to `product.price` but is editable — discounts).
   - `total_amount` — `GENERATED ALWAYS AS (unit_amount * quantity) STORED`, read-only.
   - `rate_per_usd_snapshot` — frozen currency rate at sale time. Use `paymentSnapshotCurrency(sale, currencies)` for display.
3. **`customer_id` is nullable.** Walk-in (anonymous) sales have `customer_id = NULL`.
4. **No hard delete.** Void via `voided_at` / `voided_by` / `void_reason`. Voided sales drop from the active list but stay in DB.
5. **Dashboard revenue includes sales.** `DashboardService.getMetrics()` sums `rate_per_usd_snapshot`-converted sale totals alongside payment totals.
6. **Tenant isolation via RLS.**

---

## 1. Sales list (Sales tab)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Initial load | Navigate to Sales tab | Recent sales list loads with a loading spinner until ready |
| 1.2 | Empty state | Tenant has no sales | "No sales yet" empty state; FAB still visible |
| 1.3 | Sale card content | Look at a card | Product name snapshot, customer name (or "Walk-in" if null), total amount in stored currency, date |
| 1.4 | Pagination | Scroll to bottom of a long list | Next page loads (30 per page); no flicker |
| 1.5 | Search by product name | Type partial product name | List filters to matching sales |
| 1.6 | Search by customer name | Type customer name | Matching sales appear |
| 1.7 | Search cleared | Clear the search box | Full unfiltered list restored |
| 1.8 | Pull-to-refresh | Pull down | List re-fetches from page 1 |
| 1.9 | FAB / Add button | Tap | SaleFormSheet opens (create mode) |
| 1.10 | Tap a sale card | Tap | SaleDetailSheet opens (receipt) |
| 1.11 | Voided sale hidden | Void a sale | Disappears from the active list |
| 1.12 | Branch scoping | Branch-scoped user | Sees only their branch's sales |
| 1.13 | Tenant-wide admin | No branch filter active | Sees all branches' sales |
| 1.14 | BranchSelector filter | Tenant-wide admin picks branch B | List scopes to branch B sales |

---

## 2. Record a sale (SaleFormSheet)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Happy path — with customer | Pick a product, pick a customer, submit | Sale created; appears at top of list |
| 2.2 | Happy path — walk-in (no customer) | Pick a product, leave customer empty, submit | Sale created with `customer_id = null`; "Walk-in" displayed on card |
| 2.3 | Product picker | Tap product field | Dropdown or picker opens, lists active products (SHARED + branch-specific for user's branch) |
| 2.4 | Soft-deleted product not shown | Product was soft-deleted | Does NOT appear in picker |
| 2.5 | Product pre-fills unit amount | Select a product with price $20 | Unit amount field pre-filled with `20`; remains editable |
| 2.6 | Discount / override | Change unit amount to $15 | `unit_amount = 15`; `product.price` snapshot still preserved; `product_name_snapshot` is the product name at this moment |
| 2.7 | Customer picker — async search | Type a customer name | `AsyncEntityPicker` debounces 300ms, fires `loadPage(search, page)`, lists matching customers |
| 2.8 | Customer picker — pagination | Scroll to bottom of search results | Next page loads via FlatList.onEndReached |
| 2.9 | Customer picker — stale response | Type fast (e.g. "Jo" then immediately "John") | Earlier "Jo" response discarded (requestToken guard); only "John" results shown |
| 2.10 | Customer picker — clear | Select a customer, then remove | `customer_id = null` (walk-in path) |
| 2.11 | Quantity | Enter quantity = 3 for a $20 product | `total_amount = 60` (generated column); shown in form and receipt |
| 2.12 | Quantity default | Open form | Quantity pre-filled with `1` |
| 2.13 | Quantity = 0 | Enter `0` | Submit disabled |
| 2.14 | Quantity = negative | Enter `-1` | Submit disabled |
| 2.15 | Currency selection | Pick LBP, enter `50000` | `currency_id = LBP_id, rate_per_usd_snapshot = LBP.ratePerUsd at submit time` |
| 2.16 | Switching currency does NOT convert | Type `100` in USD, switch to LBP | Field still shows `100` (same number, now interpreted as 100 LBP) |
| 2.17 | Last-used currency | Submit in LBP, re-open form | CurrencyInput defaults to LBP |
| 2.18 | Required: product | Leave product unselected | Submit disabled |
| 2.19 | Required: unit amount | Leave amount blank | Submit disabled |
| 2.20 | Amount = 0 | Enter `0` | Submit disabled |
| 2.21 | Optional notes | Leave notes blank, submit | Sale created with notes = null |
| 2.22 | Notes filled | Enter "Cash", submit | `sale.notes = "Cash"` |
| 2.23 | Snapshot: product name | Create sale for "Basic Internet", then rename product to "Premium Internet" | Sale card and receipt still show "Basic Internet" (`product_name_snapshot`) |
| 2.24 | Snapshot: rate | Submit in LBP at rate 90000. Admin edits LBP rate to 100000. View receipt | Receipt USD equivalent still based on 90000 (snapshot, not live rate) |
| 2.25 | Branch auto-assign — branch-scoped user | Branch user records a sale | `branch_id = user.branchId` (auto-assigned, no picker) |
| 2.26 | Branch picker — tenant-wide admin with customer | Record sale, pick customer in branch A | `branch_id = branch A` (inferred from customer or selectable) |
| 2.27 | Walk-in branch — tenant-wide admin | Record walk-in with no customer | Branch picker available; leaving blank → `branch_id = null` |
| 2.28 | tenant_id auto-stamped | Inspect new sale row | `tenant_id` from JWT |
| 2.29 | In-flight guard | Double-tap submit | Loading flag blocks duplicate |
| 2.30 | Network error on submit | Disable network, submit | ErrorBanner inside sheet; sheet stays open with values |

---

## 3. Sale receipt (SaleDetailSheet)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open receipt | Tap a sale card | SaleDetailSheet opens |
| 3.2 | Header | Look at the sheet title | "Sale Receipt" (or locale equivalent) |
| 3.3 | Product name | On receipt | Shows `product_name_snapshot` (frozen at sale time) |
| 3.4 | Amount (stored currency primary) | Sale in LBP, display currency = USD | Primary line shows LBP amount; secondary "≈ $X.XX" line via snapshot rate |
| 3.5 | Snapshot immunity | Renamed product / edited currency rate after recording | Displayed values unchanged (snapshot-based) |
| 3.6 | Walk-in customer | Customer = null | Shows "Walk-in" or equivalent in customer row |
| 3.7 | Customer name | Sale linked to customer | Customer name shown; tapping (if navigable) opens customer detail |
| 3.8 | Quantity and unit | quantity = 3, unit = $20 | Shows "3 × $20.00 = $60.00" (or equivalent layout) |
| 3.9 | Notes row visible | Sale has notes | Notes row shown |
| 3.10 | Notes row hidden | Sale has no notes | Notes row not rendered |
| 3.11 | Date | Always shown | Formatted sale date |
| 3.12 | Void button | Sale is not voided | "Void this sale" button visible |
| 3.13 | Voided sale UI | Open a voided sale (e.g. direct navigation) | Voided marker shown; Void button hidden |

---

## 4. Void a sale

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Open void flow | Tap "Void this sale" on receipt | Void confirmation sheet / dialog opens |
| 4.2 | Reason required | Leave reason blank | Void button disabled |
| 4.3 | Whitespace-only reason | Enter `"   "` | Service rejects: "A reason is required" |
| 4.4 | Confirm dialog | Enter reason, tap Void | ConfirmDialog: "Void Sale?" destructive style |
| 4.5 | Cancel | Tap Cancel | Returns to receipt, sale unchanged |
| 4.6 | Confirm void | Tap confirm | `voided_at`, `voided_by`, `void_reason` set on row. Sale disappears from active list |
| 4.7 | Audit trail | Inspect DB after void | Row still exists with all void fields populated |
| 4.8 | Dashboard impact | Void a current-month sale | Dashboard `salesRevenue` drops by the sale's USD equivalent; `monthlyRevenue` updates |
| 4.9 | Network error during void | Disable network, confirm | ErrorBanner; sale NOT voided |
| 4.10 | Permission gating | User role | Void available (or admin-only — verify gate; file as finding if unexpected) |

---

## 5. Customer sales panel (CustomerSalesPanel)

Displayed in the customer detail screen as a tab or panel alongside the payment grid.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Panel visible | Open a customer with sales | Sales panel / tab visible in customer detail |
| 5.2 | Empty panel | Customer has no sales | "No sales" empty state in panel |
| 5.3 | Sale card in panel | Look at a sale entry | Product name snapshot, amount in stored currency, date |
| 5.4 | Tap a sale in panel | Tap | SaleDetailSheet opens (same receipt as from Sales tab) |
| 5.5 | Walk-in sales excluded | Customer panel | Only sales linked to THIS customer; walk-ins (customer_id = null) do NOT appear |
| 5.6 | Voided sales excluded | Panel | Voided sales not shown |
| 5.7 | Snapshot rate in panel total | Panel shows year or total amount | Converted via `rate_per_usd_snapshot` (not live rate) |
| 5.8 | Panel updates after void | Void a sale via receipt | Panel refreshes, sale disappears |

---

## 6. Dashboard revenue integration

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Sales included in revenue | Record a $50 sale, open Dashboard | Hero card `monthlyRevenue` increases by $50 |
| 6.2 | Sub-line visible | Sales revenue > 0 | "Subscriptions: $X · Sales: $Y" line rendered |
| 6.3 | Sub-line hidden | No sales this month | Sub-line not rendered |
| 6.4 | Snapshot conversion | Record a 50,000 LBP sale (rate 50,000 → $1), open Dashboard | Dashboard shows +$1 from that sale |
| 6.5 | Voided sale excluded | Record then void a sale | Dashboard revenue decrements |
| 6.6 | Walk-in included | Walk-in (no customer) sale | Included in salesRevenue |
| 6.7 | Branch filter | Tenant-wide admin filters to branch A | Only branch A sales in revenue |
| 6.8 | Previous-month sale | Sale recorded in last month | NOT in current month's salesRevenue |

---

## 7. Multi-currency snapshots

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | USD sale | Submit in USD | `currency_id = null, rate_per_usd_snapshot = 1` |
| 7.2 | Non-USD sale | Submit 100 LBP at rate 90000 | `currency_id = LBP_id, rate_per_usd_snapshot = 90000` |
| 7.3 | Live rate change does not affect receipt | Record at 90000, edit rate to 100000 | Receipt still shows original USD equivalent (snapshot = 90000) |
| 7.4 | Display currency | User's display = EUR | Receipt primary shows LBP; secondary "≈ €X" via snapshot |
| 7.5 | `paymentSnapshotCurrency()` used | Inspect SaleCard and SaleDetailSheet rendering | Snapshot rate overrides live rate for all displayed USD equivalents |
| 7.6 | Soft-deleted currency | Soft-delete LBP; open a sale in LBP | Receipt still displays the LBP amount using the snapshot; no crash |

---

## 8. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Product deleted after sale | Soft-delete product, view old sale | Receipt shows `product_name_snapshot` (the name at sale time); no crash |
| 8.2 | Customer deactivated after sale | Deactivate customer, view old sale | Receipt shows customer name; customer detail accessible |
| 8.3 | Customer deleted after sale | Delete customer (cascade) | Sale still exists; `customer_id` becomes null; receipt shows "Walk-in" |
| 8.4 | Very large quantity | Enter quantity = 999 | `total_amount = unit_amount × 999`; no overflow errors |
| 8.5 | Very large unit amount | Enter near-max integer | Stored correctly; receipt formats without crash |
| 8.6 | Concurrent create (two users) | Two users submit a sale simultaneously | Both succeed (no unique constraint across sales; each is a separate row) |
| 8.7 | RTL | Arabic language | SaleCard, SaleFormSheet, SaleDetailSheet all mirror correctly |

---

## 9. Permissions matrix

| Operation | Admin (tenant-wide) | Admin (branch-scoped) | User |
|-----------|--------------------|-----------------------|------|
| View sales list | ✓ | ✓ (own branch) | ✓ (own branch) |
| Record sale | ✓ | ✓ | ✓ |
| View sale receipt | ✓ | ✓ | ✓ |
| Void sale | ✓ | ✓ | ⚠ Verify gate |
| View customer sales panel | ✓ | ✓ | ✓ |
