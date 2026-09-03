# Sales — QA Scenarios

Covers the one-off sales ledger: recording a sale (with **one or more products and/or services**) against an optional customer, viewing the sales list, the sale receipt, the row's 3-dot action menu, editing a recorded sale, voiding a sale, and the per-customer sales panel. Sales are a completely separate ledger from subscription payments — they share no schema or service code beyond the snapshot-rate principle. Sending the sale receipt to the customer over WhatsApp (the form's second button and the receipt sheet's Send button) is covered in [whatsapp-invoices.md](whatsapp-invoices.md). The service **price list** itself (Admin → Services) is covered in [services.md](services.md).

**A sale is a header (`sales`) + one or more lines (`sale_items`), and a line sells a PRODUCT or a SERVICE.** One sale can hold several lines in any mix — products only, services only, or both. The header carries the single sale currency + rate snapshot, the summed `total_amount` and a frozen `items_summary`. It holds **no money**: what the sale owes is its `charges` row (written in the same transaction) and what was collected is a `collections` row — which is what lets one sale take installments. Each line carries `line_type`, a nullable `product_id` / `service_id`, `item_name_snapshot`, `quantity` (**always 1 on a service line** — labour has no count, so the row shows only a Price field), `unit_amount`. Debt, wallet and revenue are all **bill-level**: one bill per sale whatever its lines sell. `Sale.amountPaid` is DERIVED from that bill's balance (filled by `SaleService.withMoney`), never a stored column. The Sales-tab month headers show **value sold** (`total_amount`); revenue and the wallet read the hand-overs.

**Reference code:**
- Screen: [SalesPanel.tsx](SubsTrack/src/modules/transaction/sales/screens/SalesPanel.tsx) (the Sales tab of the Transactions hub)
- Form sheet: [SaleFormSheet.tsx](SubsTrack/src/modules/transaction/sales/components/SaleFormSheet.tsx)
- Detail sheet: [SaleDetailSheet.tsx](SubsTrack/src/modules/transaction/sales/components/SaleDetailSheet.tsx)
- Card: [SaleCard.tsx](SubsTrack/src/modules/transaction/sales/components/SaleCard.tsx)
- Row action menu (every per-sale action, shared by all three surfaces): [useSaleActions.tsx](SubsTrack/src/modules/transaction/sales/hooks/useSaleActions.tsx)
- Customer panel: [CustomerSalesPanel.tsx](SubsTrack/src/modules/transaction/sales/components/CustomerSalesPanel.tsx)
- Bulk send on WhatsApp: [useSaleInvoiceAction.tsx](SubsTrack/src/modules/transaction/sales/hooks/useSaleInvoiceAction.tsx) + [InlineSelectionToolbar.tsx](SubsTrack/src/shared/components/InlineSelectionToolbar.tsx)
- Service: [SaleService.ts](SubsTrack/src/modules/transaction/sales/services/SaleService.ts)
- Repository: [SaleRepository.ts](SubsTrack/src/modules/transaction/sales/repository/SaleRepository.ts)
- Customer picker: [AsyncEntityPicker.tsx](SubsTrack/src/shared/components/AsyncEntityPicker.tsx)
- Route: [transactions/index.tsx](SubsTrack/app/(app)/(tabs)/transactions/index.tsx)
- Dashboard service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Currency utils: [currency.ts](SubsTrack/src/core/utils/currency.ts)

---

## 0. Critical invariants

1. **Sales and subscription payments are completely separate.** Different tables, different services, different slices. The only shared concept is the snapshot-rate principle.
2. **Snapshots are frozen at sale time.**
   - `sale_items.item_name_snapshot` — frozen name per line (a product's, a catalog service's, or the typed one-off), survives renames and soft-deletes. Renamed from `product_name_snapshot`.
   - `sale_items.unit_amount` — frozen per-line price at sale time (defaults to the product's price converted into the sale currency, but is editable — discounts).
   - `sales.total_amount` — **app-written** sum of every line's `unit_amount * quantity` (no longer a generated column). Snapshot, read-only after create.
   - `sales.items_summary` — frozen summary of every line (e.g. `"Water ×2, Installation"`); powers search + list/debt/wallet labels.
   - `sales.rate_per_usd_snapshot` — frozen currency rate at sale time. Use `paymentSnapshotCurrency(sale, currencies)` for display.
3. **One currency per sale.** Every line's `unit_amount` is in the sale's `currency_id`. Products priced in another currency are auto-converted into the sale currency (live rate) as the editable prefill.
4. **`customer_id` (header) is nullable.** Walk-in (anonymous) sales have `customer_id = NULL`.
5. **No hard delete.** Void via `voided_at` / `voided_by` / `void_reason` on the header. Voided sales drop from the active list but stay in DB; lines cascade only on hard delete.
5a. **A void takes the sale's PAYMENTS with it** (§4). The cash was handed over *for* this sale, so leaving it live would point real money at a record that no longer exists. It is never silent — the confirm message states it — but it is also never *counted*: the wording is unconditional, so opening the dialog costs no reads, and it warns that a hand-over covering another bill is voided **whole**.
5b. **A non-voided sale is EDITABLE in place** (§2C) — every snapshot in rule 2 is re-taken by the edit, including `rate_per_usd_snapshot` when the currency changes. A line the edit drops is **soft-voided** (`sale_items.voided_at`), never deleted, and the sale's stock movements are **swapped** (old soft-voided, new inserted) only when the per-product unit count actually changed. A voided sale can never be edited.
6. **Dashboard revenue includes sales, as CASH.** There is ONE cash read (`collectedInRange`), and each row is tagged with the bill it settled — so cash against a sale counts as **sales** revenue whether it arrived at the till or three months later. A partial sale contributes only what was collected. `salesCount` counts sale headers, paid or not.
7. **Product delete-reference counts key off `sale_items.product_id`.** A product used by any sale line soft-deletes (kept), else hard-deletes. Services follow the same rule off `sale_items.service_id`.
8. **Tenant isolation via RLS.** `sale_items` inherits its branch from the parent sale.
9. **A SERVICE line moves no stock, costs nothing, and has NO quantity.** No `stock_movements` row, no oversell check, no Expenses entry, and no stepper — just a **Price**, which is the whole line total (`quantity` stores 1). That absence is the whole difference from a product line. Two jobs are two lines. A sale must still hold **at least one** line of some kind.
9b. **A line's KIND is chosen when the line is added** — **+ Add product** / **+ Add service** in the cart footer — and the card only labels it. There is no per-row switch to change it (that shape read as a page tab bar and wiped the line, gotcha #101); removing the row and adding the other kind is the way. A new sale therefore opens with **zero** rows and any row, including the last, is removable.
10. **A one-off service has no catalog row.** `line_type = 'service'` with `service_id IS NULL`; `item_name_snapshot` is the entire record of what was sold. `chk_sale_items_line_ref` allows exactly this gap and nothing looser.
11. **Services are not a separate money stream.** A sale raises ONE bill whatever its lines sell, so Reports keeps one "Sales" stream — a mixed sale's cash cannot be split between goods and labour without inventing an allocation.

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

## 1A. Sales filter bar (Sales tab)

| # | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| 1A.1 | Customer filter | Tap customer chip, pick a customer | List scopes to that customer's sales; chip shows active (indigo) style |
| 1A.2 | Customer filter cleared | In customer chip, pick "All customers" | Full list restored |
| 1A.3 | Product filter | Tap product chip, pick a product | List scopes to that product's sales |
| 1A.4 | Product list lazy-loaded | Open Sales tab fresh (Products tab never visited), tap product chip | Active products are loaded and listed in the dropdown |
| 1A.5 | Soft-deleted product excluded | A product was soft-deleted | Does NOT appear in the product filter dropdown |
| 1A.6 | Product filter cleared | In product chip, pick "All products" | Full list restored |
| 1A.7 | From date | Tap "From" chip, pick a date, confirm | List shows sales on/after that day; chip shows "From <date>" in active style |
| 1A.8 | To date (inclusive) | Set "To" = today, record/inspect a sale dated today | Today's sale is included (end bound is inclusive) |
| 1A.9 | Date range together | Set From = 1st, To = 7th | Only sales within that 7-day window (both ends inclusive) show |
| 1A.10 | Range cross-constraint | Set From = 10th | "To" picker disallows dates before the 10th (minDate); inverse for "From" maxDate |
| 1A.11 | Clear a single date | Open a set date chip, tap "Clear" in the picker | That date bound resets; chip returns to placeholder |
| 1A.12 | Clear filters chip hidden | No filter active | "Clear filters" chip is not shown |
| 1A.13 | Clear filters chip | Apply ≥1 filter (customer/product/date) | "Clear filters" chip appears |
| 1A.14 | Clear all filters | Tap "Clear filters" | Customer, product, and both dates reset in one tap; full list restored |
| 1A.15 | Filters + search combine | Set product filter AND type a search term | Results match both (AND) |
| 1A.16 | Empty state with filters | Apply a filter that matches nothing | "No sales yet" empty state; "Record First Sale" action hidden (only shown when unfiltered) |
| 1A.17 | Filters + pagination | Apply a filter on a large dataset, scroll | Next pages keep the same filter applied |
| 1A.18 | Filters survive branch change | Set a filter, switch BranchSelector | Filter is re-applied against the new branch scope |

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
| 2.11 | Quantity | Enter quantity = 3 for a $20 product | line total = 60; `total_amount = 60` (app-written sum); shown in form and receipt |
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

## 2A. Multi-product cart & currency auto-convert (SaleItemsEditor)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2A.1 | Empty cart is the start | Open form | **No** line rows. Two dashed buttons — **+ Add product** and **+ Add service** — sit under the sale-currency picker; Save is disabled |
| 2A.1a | Add the first line | Tap **+ Add product** | One row appears, headed by a cube icon + "Product" and a Remove action; no `#1` (a single line is not numbered) |
| 2A.2 | Add a second line | Tap **+ Add product** again | A second row appears; both rows now show `#1` / `#2` after their kind label |
| 2A.3 | Remove a product | Tap Remove on a row (with ≥2 rows) | That row disappears; total recomputes |
| 2A.4 | The last row can be removed | Remove the only row | The cart empties back to the two add buttons; Save is disabled. (This is how a line's kind is changed — see 2Ab.2) |
| 2A.5 | Per-line quantity + price | Set line 1 = product A ×2, line 2 = product B ×1 | Total = A.unit×2 + B.unit×1; the emerald "Total" reflects the sum |
| 2A.6 | Summed total | Two lines totalling 30 | "Total" shows 30 in the sale currency |
| 2A.7 | items_summary saved | Submit a 2-product sale, inspect the card/receipt | Card title + receipt hero show a summary like "A ×2, B"; DB `items_summary` matches |
| 2A.8 | First product sets sale currency | Fresh form, pick a product priced in LBP | Sale currency defaults to LBP; the line prefills the LBP price |
| 2A.9 | Mixed-currency product auto-convert | Sale currency = USD, add a product priced 100,000 LBP (rate 89000) | That line's unit price prefills ≈ 1.12 USD (converted); editable |
| 2A.10 | Change sale currency re-prices lines | Add products, then switch sale currency USD→LBP | Every line's unit price re-prefills from its product's catalog price converted to LBP |
| 2A.11 | Manual override persists | Edit a line's unit price, don't change product/currency | The typed value stays (only product-pick / currency-change re-prefills) |
| 2A.12 | Line with no product | Add a row, leave its product empty | Submit disabled until the row has a product + valid amount (or is removed) |
| 2A.13 | Add product inline | Tap "+" on the product dropdown | ProductFormSheet opens; created product becomes selectable |
| 2A.14 | One rate snapshot | Submit a mixed-currency-source sale in USD | Header stores one `currency_id = null` + `rate_per_usd_snapshot = 1`; each line's `unit_amount` is the converted USD value |
| 2A.15 | Search finds any product | Record a sale with products A + B, search "B" on the Sales tab | The sale appears (matched via `items_summary`) |

---

## 2A-b. Service lines (SaleItemsEditor, Service mode)

> A line may sell labour instead of goods. Everything here is the *absence* of stock **and of quantity**, plus the one-off escape hatch. The price list itself is [services.md](services.md).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2Ab.1 | Add a service line | Tap **+ Add service** | A row appears headed by a tool icon + "Service": a service dropdown, **no quantity stepper**, and no "N left" caption anywhere on it |
| 2Ab.1a | There is NO per-row kind switch | Look at any line card | The card **labels** its kind (icon + word) — it is not tappable. There is no `Product | Service` segmented control (it read as a page tab bar and wiped the line — gotcha #101) |
| 2Ab.1b | A picked product survives adding a service | Pick product A, then tap **+ Add service** | Row 1 keeps product A, its quantity and its price untouched; the service arrives as row 2. **This is the bug this design fixes** |
| 2Ab.2 | Changing a line's kind | Row holds product A; you wanted a service | Remove the row, then tap **+ Add service**. Nothing is silently discarded — the removal is the explicit step |
| 2Ab.3 | Mixed cart, any order | Add service, then product, then service | Three rows in that order, each with its own controls; the total sums all three |
| 2Ab.4 | Pick a catalog service | On a service row, pick "Installation" ($25) | Unit price prefills 25 in the sale currency; `line_type='service'`, `service_id` set |
| 2Ab.5 | Service price auto-converts | Sale currency LBP (rate 89000), pick a service priced $25 | Unit price prefills ≈ 2,225,000 LBP; editable |
| 2Ab.6 | First service sets sale currency | Fresh form, first pick is a service priced in LBP | Sale currency defaults to LBP (same rule as a product) |
| 2Ab.7 | A service has NO quantity | Look at a service row | There is **no** quantity stepper at all — only one field labelled **Price**, which takes the full row width. Labour is one job at one price |
| 2Ab.7a | The price IS the line total | Service priced 25, save | No "1 ×" appears anywhere in the form; `sale_items.quantity = 1`, `unit_amount = 25`, the line total reads 25 |
| 2Ab.7b | Two jobs are two lines | Two installations at 25 each | Add a **second** service line — total 50. There is no way to enter "×2" |
| 2Ab.7c | Mixed row types keep their own controls | Row 1 = product, row 2 = service | Row 1 shows the stepper + "N left"; row 2 shows only Price. Changing row 1's quantity leaves row 2 alone |
| 2Ab.8 | One-off: "Other" reveals a name field | On a service row, pick **Other — type a name** | A "What was done" input appears; unit price is cleared |
| 2Ab.9 | One-off saves with no catalog row | Type "Emergency call-out", price 40, save | Sale saves; `service_id IS NULL`, `item_name_snapshot = 'Emergency call-out'`; **no** new row in Admin → Services |
| 2Ab.10 | Blank one-off name blocks submit | "Other" selected, name left empty | Submit disabled; forcing it raises "Pick a service, or type what was done" |
| 2Ab.11 | Add a service inline | Tap "+" on the service dropdown, create "Router setup" $15, save | Sheet closes, the row is now **selected on "Router setup" with 15 prefilled** (not blank) |
| 2Ab.12 | Service-only sale | One service line only, save | Sale saves; **zero** `stock_movements` rows written; no product's stock changes; Transactions → Expenses unchanged |
| 2Ab.13 | Mixed sale | Product A ×2 + Installation, save | Total = both lines; only A's stock drops by 2; `items_summary` reads `"A ×2, Installation"` — the service carries **no** count |
| 2Ab.14 | Search finds a service name | Record the 2Ab.13 sale, search "Installation" | The sale appears (matched via `items_summary`) |
| 2Ab.15 | Retired service stays on its own line | Soft-delete a service that a sale uses, then edit that sale | The line keeps it selected; the dropdown will not offer it for a **new** line |
| 2Ab.16 | Partial service-only sale → Sales debt | Service-only sale for a customer, collect part | Debts shows ONE row under the **Sales** category (not "Services") for the remainder |
| 2Ab.17 | Void a service-only sale | Void it | Revenue drops by the collected amount; **no** stock movement is touched anywhere |
| 2Ab.18 | Receipt marks the service | Open the receipt of the 2Ab.13 sale | Both lines listed under "Items"; the service line carries a small tool icon, the product line does not |
| 2Ab.19 | Receipt drops the "1 ×" | Same receipt | The product line reads `2 × $x`; the service line shows **only its name and total** — no `1 × $25` sub-line |
| 2Ab.20 | WhatsApp invoice drops it too | Send the 2Ab.13 sale on WhatsApp | The product bullet reads `2 × … = …`; the service bullet is `• Installation  $25` |
| 2Ab.21 | Legacy quantity re-reads as 1 | (Dev data only) a service line saved with quantity 3, then **Edit sale** | The row opens with no stepper and the form total counts the line **once**; the shown total is what saving writes — confirm the total on screen before saving |

---

## 2B. Stock limits when recording a sale

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2B.1 | Stock shown in the picker | Open the product dropdown | Each in-stock product's sub-line reads "«price» · N left" |
| 2B.2 | Out-of-stock is visible but unpickable | A product has 0 stock | It is listed, greyed out, sub-line "Out of stock", and tapping it does nothing |
| 2B.3 | Remaining shown per line | Pick a product with 4 in stock | The row shows "4 left" under the quantity stepper |
| 2B.4 | Stepper caps at stock | Product has 3 in stock; tap "+" repeatedly | Quantity stops at 3 |
| 2B.5 | Same product on two lines | 3 in stock; line 1 = product A ×2, line 2 = product A | Line 2's "+" stops at 1 (the combined 3), and its hint reads "1 left" |
| 2B.6 | Oversold cart blocks submit | Force lines summing above stock (e.g. stock dropped after the form opened) | Submit stays disabled |
| 2B.7 | Service blocks an oversell | Sell 4 of a product with 3 (bypass the UI cap, e.g. stock changed on another device) | Save fails with "Only 3 left of «product»"; NO sale row and NO movement is written |
| 2B.8 | Service blocks a zero-stock sale | Sell a product whose stock hit 0 after the form opened | Save fails with "«product» is out of stock" |
| 2B.9 | Per-product sum, not per line | 3 in stock; two lines of 2 each (total 4) | Blocked — the check sums per product, not per line |
| 2B.10 | Blocked from every entry point | Repeat 2B.7 from the quick-actions menu, the customer card, and `CustomerSalesListScreen` | Same error each time (the check lives in `SaleService`) |
| 2B.11 | Successful sale decrements | Sell 2 of 5 | Sale saves; the product card shows 3; one `-2` `Sold` movement exists |
| 2B.12 | Void restores | Void that sale | Product returns to 5; the movement is struck through in the stock history |
| 2B.13 | Bulk void restores each | Bulk-void 3 sales of the same product | Every one of their movements is voided; stock returns to the pre-sale total |
| 2B.14 | Offline oversell is allowed | Two devices offline each sell the last unit, then sync | Both sales survive; stock goes to −1 and the card reads "Short by 1" |

---

## 2C. Edit an existing sale (SaleFormSheet in edit mode)

> One sale = header + lines + stock movements, and each has its own correction rule (gotcha #90). Any staff member may edit; a **voided** sale never can be.

**Entry & prefill**

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2C.1 | Two ways in | Open a non-voided sale's 3-dot menu, and its receipt | Both offer "Edit sale" (on the receipt it sits above Change history / Void) |
| 2C.2 | Voided sale has no edit | Open a voided sale's menu and receipt | No "Edit sale" in either (void is final — record a new sale) |
| 2C.3 | Receipt closes behind the form | Tap "Edit sale" on the receipt | The receipt dismisses and the form opens — never two stacked full sheets |
| 2C.4 | All three surfaces | Repeat 2C.1 from the Sales tab, the customer detail panel, and the per-customer sales page | Same action, same form, on all three |
| 2C.5 | Title + button | Form is open in edit mode | Title "Edit Sale"; primary button "Save Changes" (not "Record Sale") |
| 2C.6 | Cart prefill | Sale had Water ×2 @ 3 and Bread ×1 @ 2 | Two line cards, correct products, quantities and unit prices; the sale's currency is selected |
| 2C.7 | Customer prefill + editable | Sale belongs to Ali | Customer picker shows Ali and **is editable** (even when opened from Ali's own screen) |
| 2C.8 | Walk-in prefill | Sale has no customer | Picker is empty ("Walk-in"); the collect-now section is hidden — a walk-in is always paid in full |
| 2C.9 | Collect-now starts at nothing | Open the form on a partly-paid sale (100 of 130) | A read-only **Paid 100** line, then **"Collect now — 30 still owed"** with **Pay later** selected. Most edits only fix the cart, so no money moves unless asked |
| 2C.9a | Fully paid sale offers no collection | Open the form on a fully paid sale | Only the read-only Paid line — nothing is owed, so there is nothing to collect |
| 2C.10 | Notes prefill | Sale has notes | Notes field carries them |
| 2C.11 | No false "discard changes" | Open the edit form, wait for products to load, close it | Closes straight away — **no** discard prompt (`SaleCartDraft.dirty`) |
| 2C.12 | Real change prompts | Change a quantity, then close | "Discard changes?" prompt appears; "Keep editing" preserves the change |
| 2C.13 | Untouched save writes no audit | Open the form and save with nothing changed | Save succeeds; **no** new entry in the sale's Change history |

**Stock, the ledger, and the credit**

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2C.14 | Own units are credited | Product has 0 left because this sale took the last 2; open the edit form | The line shows "2 left", the product is pickable, and the cart is not "oversold" |
| 2C.15 | Re-price only | Change only the unit price and save | Saves. Product stock is **unchanged**, and its stock history gains **no** new rows (footprint unchanged) |
| 2C.16 | Notes only | Change only the notes | Same as 2C.15 — stock history untouched |
| 2C.17 | Line split, same units | Replace one line of ×3 with two lines of ×1 and ×2 (same product) | Saves; stock unchanged; **no** new movements (compared per product, not per line) |
| 2C.18 | Quantity up | Sale had ×2, stock 5 (so 7 in the pool); change to ×3 | Stock becomes 4. The old `-2` movement is struck through and a new `-3` appears |
| 2C.19 | Quantity down | Change ×3 back to ×2 | Stock returns to 5; the `-3` is struck through and a new `-2` appears — never a `+1` correction row |
| 2C.20 | Swap the product | Replace product A with product B | A's units come back, B's go out; A's old movement is voided and only B has a live one |
| 2C.21 | Add a line | Add a second product | New line saved; a new movement for it |
| 2C.22 | Remove a line | Delete one of two lines and save | Receipt now shows one line, its total matches; the removed product's stock is returned |
| 2C.23 | Oversell is still blocked | Raise a quantity past pool (on-hand + this sale's units) | Submit disabled; if forced (stock changed elsewhere), save fails with "Only N left of «product»" and **nothing** is written |
| 2C.24 | Deactivated product keeps its line | Soft-delete a product that is on the sale, then edit the sale | Its line still resolves and can be re-saved; the product is greyed out / unpickable for a **new** line |
| 2C.25 | Repeat void is still safe | Edit a sale (movements swapped), then void the sale | Only the live movements are struck; stock returns exactly once |
| 2C.25a | Service line prefills correctly | Edit a mixed sale (product + catalog service) | The service row is headed "Service" with the right service and price selected |
| 2C.25b | One-off line prefills from its frozen name | Edit a sale holding a one-off service | The row is headed "Service" and sits on "Other", with the typed name and price restored from `item_name_snapshot` |
| 2C.25c | Service-only edit leaves the ledger alone | Edit a service-only sale (change price or notes) | Saves; **no** stock movement is created or voided anywhere (two empty footprints — gotcha #97) |
| 2C.25d | Add a service to a product sale | Existing product sale; add a service line and save | Total grows; the product's stock history gains **no** new rows (its unit count did not change) |
| 2C.25e | Replace the last product with a service | Sale = product A ×2; remove that line and add a service line | A's 2 units come back **exactly once**; A's movement is struck through and no new movement exists |
| 2C.25f | Replace a service with a product | Sale = one service; remove that line and add product B ×1 | B's stock drops by 1; one live movement for B |

**Money, currency, and what flows on**

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2C.26 | Currency change re-freezes the rate | Sale in USD; switch to LBP and save | Lines re-price into LBP; `rate_per_usd_snapshot` is the **current** LBP rate, and the receipt's ≈ USD value follows it |
| 2C.27 | Collect-now cannot exceed what is owed | Partial sale 100 of 130; pick Partial and type 40 | Save disabled with "Amount paid cannot exceed amount due" — the ceiling is the **30** still owed, not the 130 total |
| 2C.28 | Re-pricing above what was collected | Fully paid sale; raise a quantity | The BILL rises, so the sale now owes the difference and appears in Debts. The payment is untouched |
| 2C.29 | Debt follows | Partial sale; raise the total | Transactions → Debts shows the larger Sales debt for that customer |
| 2C.30 | Debt cleared by collecting the rest | Partial sale; pick **Full payment** under Collect now and save | The Sales debt disappears — and a **new** `collections` row dated today, by the editing staff member, is what cleared it (the original payment keeps its own date) |
| 2C.30a | Part of the rest | Partial sale 100 of 130; pick Partial, type 20 | Two payments now sit on the bill (100 and 20); 10 still owed; the bill sheet lists both |
| 2C.30b | Collecting seeds the editor's wallet | Do 2C.30 as a collector | The new hand-over appears in **that collector's** wallet, not the original recorder's |
| 2C.31 | **What was already collected is read-only** | Open the form on a partly-paid sale | The Paid figure shows and cannot be edited — undoing a hand-over is a **void**, in the bill sheet that owns it. The form can only ADD to it |
| 2C.32 | Re-pricing below what was collected is refused | Cut the cart under the collected amount | Save is disabled, and the service refuses it (`errors.sale_total_below_collected`) |
| 2C.33 | Revenue does not move on an edit | Edit a sale in the current month | Revenue is unchanged — only the bill moved. The DEBT moves |
| 2C.33 | No custody lock (accepted) | Edit a sale whose cash was already handed to an admin | Edit is allowed; the changed amount sits with the **current** holder |
| 2C.34 | Move to another customer | Change the customer and save | The sale (and any debt it carries) moves to the new customer |
| 2C.35 | Section totals refresh | Edit a sale's total from the Sales tab | The month section header total is recalculated (the list refetches, not just the card) |
| 2C.36 | Save & send | Press "Save & send on WhatsApp" on an edit | Sale saves, then WhatsApp opens with the **corrected** receipt |

**Branch, audit, offline**

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2C.36a | A walk-in must stay fully paid | Edit a walk-in sale and raise its total | The extra is collected automatically at save — a walk-in can never be left owing (`errors.sale_walkin_must_be_paid`) |
| 2C.36b | Clearing the customer off an owing sale is refused | Partly-paid sale; remove the customer and save | Refused — an anonymous debt could never be chased |
| 2C.37 | Walk-in keeps its branch | Tenant-wide admin edits a **walk-in** sale recorded by a Branch A collector | The sale stays in Branch A — it does **not** become unassigned |
| 2C.38 | Customer sale takes the customer's branch | Change the customer to one in Branch B | The sale moves to Branch B |
| 2C.39 | Audit entry | Admin → the sale's Change history after an edit | One "Edited" entry listing only the changed columns (e.g. Total / Items summary), with the editing staff member as actor. Money taken by the edit is a separate **Payment** entry, never a column on the sale |
| 2C.40 | Original recorder is kept | Edit someone else's sale | `recorded_by_user_id` is unchanged; only the audit names the editor |
| 2C.41 | Offline edit | Go offline, edit a sale, reconnect | Header, lines and movements all push; totals and stock match on the server |
| 2C.41a | Offline edit that also collects | Offline, edit a pay-later sale and collect it in full | The sale, its bill and the new hand-over commit together locally, and all push on reconnect |
| 2C.42 | Removed line syncs | Device A removes a line and syncs; open the sale on device B | Device B shows the reduced line set — **no** phantom line (lines are soft-voided, not deleted) |
| 2C.43 | Product filter follows | Sale contained product A; edit it to remove A; filter the Sales tab by A | The sale no longer matches |
| 2C.44 | Product still undeletable | After 2C.43, try to delete product A | Still soft-deletes (the voided line keeps the reference) |

---

## 2D. Sale row action menu (3-dot)

> Every action one sale offers, in one menu, defined once in `useSaleActions` and shared by all three sales surfaces.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2D.1 | Menu button is on every row | Look at a sale card | A 3-dot button on the trailing edge; tapping it opens the menu (it does **not** open the receipt) |
| 2D.2 | Menu title | Open the menu | Title is the sale's frozen `items_summary` — the same text the card shows |
| 2D.3 | Full action set | Open the menu on a **partly-paid** non-voided sale with a customer | Exactly: View receipt · Edit sale · **Collect $N** · Send invoice on WhatsApp · History · Void sale |
| 2D.3b | Fully-paid sale has no Collect | Open the menu on a fully-paid sale | Same list **minus Collect** — nothing is owed |
| 2D.3c | Walk-in has no Collect | Open the menu on a walk-in sale | No Collect — a walk-in must be paid in full at the till, so it can never owe |
| 2D.4 | Voided sale is cut down | Open the menu on a voided sale | Only View receipt · History. No edit, no complete, no send, no void |
| 2D.5 | View receipt | Tap "View receipt" | The menu closes and the receipt sheet opens — same sheet a card tap gives |
| 2D.6 | Edit sale | Tap "Edit sale" | The sale form opens in edit mode, prefilled (see § 2C) |
| 2D.7 | Send invoice | Tap "Send invoice on WhatsApp" on a sale for a customer with a phone | WhatsApp opens with that one sale's receipt text |
| 2D.8 | Walk-in cannot send | Open the menu on a walk-in sale | The WhatsApp row is **visible but greyed**, captioned "Walk-in sale — no customer to send to"; tapping does nothing |
| 2D.9 | No phone cannot send | Customer has no phone (or only non-digits like "-") | Row greyed, captioned "No phone number for this customer" |
| 2D.10 | History | Tap "History" as an admin | The sale's change history sheet opens (same content as the receipt's Change history) |
| 2D.11 | History as staff | Tap "History" as a `user` | The sheet opens and says "Admins only" — never an empty (untrue) timeline |
| 2D.12 | Void from the menu | Tap "Void sale" | The reason dialog opens titled **"Void this sale"** (singular — never "Void 1 sales") |
| 2D.13 | Void completes | Type a reason and confirm | The sale is voided, drops out of the list, and its stock is returned |
| 2D.14 | Void cancelled | Open the void dialog and cancel | Nothing is written; the sale is untouched |
| 2D.15 | Void failure keeps the dialog | Force a failing void (e.g. offline-only error) | The dialog stays open with the error; it does not close silently |
| 2D.16 | Bulk void still reads plural | Select 3 sales → Void from the selection toolbar | Same dialog, titled "Void 3 sales" — one dialog serves both paths |
| 2D.17 | Menu hidden while selecting | Long-press a card to enter multi-select | The 3-dot button is replaced by the checkbox on every row |
| 2D.18 | Long-press still selects | Long-press a card (not in selection mode) | Enters multi-select — the menu does **not** open |
| 2D.19 | Same menu everywhere | Repeat 2D.3 from the Sales tab, the customer panel, and the per-customer page | Identical rows in identical order |
| 2D.20 | List refreshes after a menu void | Void from the menu on the customer panel / per-customer page | The local list refreshes and the row disappears without a manual pull-to-refresh |
| 2D.21 | Arabic / RTL | Switch to Arabic and open the menu | All labels translated; rows and icons mirror; the WhatsApp badge does **not** mirror |
| 2D.22 | Menu closes on Back | Open the menu and press Android Back (or browser Back) | The menu closes; the screen behind it does **not** change |

### 2D-b. Collect what a sale still owes

> A pay-later or partly-paid sale is collected through the **same sheet** as every other bill. The old **Complete** action is gone: it existed only because `amount_paid` had no date of its own, so "he really paid in full" could only be said by rewriting a number. Now the second payment is recorded on the day it happened.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2D-b.1 | The label names the amount | Open the menu on a sale owing 25 | The row reads **Collect $25** |
| 2D-b.2 | It opens the collect sheet | Tap it | Single-item mode, pre-filled with 25, no split preview |
| 2D-b.3 | Collect it all | Save | The card's fraction disappears; the sale leaves the Debts screen |
| 2D-b.4 | Collect part | Type 10 | The sheet says "leaves 15 owing"; the sale stays in Debts at 15 |
| 2D-b.5 | Installments | Collect 10, then 10, then 5 | Three hand-overs, three rows in the money-in history, one settled sale |
| 2D-b.6 | Cannot overpay | Type 30 on a 25 balance | Refused |
| 2D-b.7 | Revenue lands on the collection date | Collect next month | The money counts in **next** month, not in the sale's month |
| 2D-b.8 | Wallet | Collect as a collector | The cash appears in that collector's wallet |
| 2D-b.9 | Voiding it | Void that hand-over | The sale owes again; revenue and the wallet both drop |


---

## 3. Sale receipt (SaleDetailSheet)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open receipt | Tap a sale card | SaleDetailSheet opens |
| 3.2 | Header | Look at the sheet title | "Sale Receipt" (or locale equivalent) |
| 3.3 | Products list | On receipt | Its own card, separate from the customer/date rows: "Products" header, then one row per line — name (frozen `product_name_snapshot`), `qty × unit price` sub-line, line total on the right |
| 3.4 | Amount (stored currency primary) | Sale in LBP, display currency = USD | Primary line shows LBP amount; secondary "≈ $X.XX" line via snapshot rate |
| 3.5 | Snapshot immunity | Renamed product / edited currency rate after recording | Displayed values unchanged (snapshot-based) |
| 3.6 | Walk-in customer | Customer = null | Shows "Walk-in" or equivalent in customer row |
| 3.7 | Customer name | Sale linked to customer | Customer name shown; tapping (if navigable) opens customer detail |
| 3.8 | Multi-product layout | 3-product sale | Products header shows a "3" count badge; each row is numbered 1–3; a Total footer row shows `total_amount` |
| 3.8a | Single-product layout | 1-product sale, fully paid | No count badge, no line numbers, no Total footer (the hero already shows the amount); the one row still shows `1 × price` |
| 3.8b | Hero caption | 3-product sale | Hero shows "3 products" instead of the long frozen `items_summary`; a 1-product sale still shows the summary |
| 3.8c | Partial sale totals | A sale that still owes | Footer shows Total, Paid, and Remaining (amber) — Paid comes from the bill's balance, not from a column |
| 3.8d | Lean read (no lines) | Sale loaded without `sale_items` | Products card not rendered; rest of the receipt unaffected |
| 3.9 | Notes row visible | Sale has notes | Notes row shown |
| 3.10 | Notes row hidden | Sale has no notes | Notes row not rendered |
| 3.11 | Date | Always shown | Formatted sale date |
| 3.12 | Void action | Sale is not voided | "Void sale" appears in the header 3-dot menu (red), **not** as a button in the body — see §3A |
| 3.13 | Voided sale UI | Open a voided sale (e.g. direct navigation) | Voided marker shown; the 3-dot menu offers History only (no Edit, no Void, no WhatsApp) |
| 3.14 | Payments list shown | Open a sale that took money | Under the products card: a "N payments" heading and one row per hand-over — amount put against THIS sale, date + time, collector name |
| 3.15 | Nothing collected yet | Open a pay-later sale with no payment | Heading reads "0 payments"; body reads "No payments yet." |
| 3.16 | Installments | Sale of $50 collected as $20 then $30 | Two rows, $20 and $30, each with its own date and collector; hero still shows the totals from the sale |
| 3.17 | Hand-over that also paid other bills | Collect one payment covering this sale AND a month | The row shows only the part put against this sale, plus the "also paid other bills" note |
| 3.18 | Voided payment row | Void a payment on the sale | The row stays, dimmed, marked "Voided"; it has no 3-dot menu; the live count drops by one |
| 3.19 | Void a payment from the receipt | Row 3-dot → Void payment → confirm | Payment voided; the list reloads; the sales list behind refreshes so the sale reads as owing again |
| 3.20 | Send a receipt for one payment | Row 3-dot → Send on WhatsApp (customer has a phone) | wa.me opens with that hand-over's receipt |
| 3.21 | Walk-in sale payments | Open a walk-in sale that took money | Rows are listed; the 3-dot menu offers only Void payment (no WhatsApp — there is no customer) |
| 3.22 | Lean read (no chargeId) | Sale loaded without its bill | Payments block not rendered at all; no request fired |
| 3.23 | Voided sale | Open a voided sale that had payments | Rows still listed, all marked "Voided" (the bill void took them) |
| 3.24 | Currency | Sale in LBP | Every payment row prints in LBP using the row's frozen rate — same as the month bill sheet |

---

## 3A. Receipt header 3-dot menu (gotcha #131)

The receipt's body used to end in **four** stacked full-width buttons (Send on WhatsApp, Edit sale, History, Void sale). Only the WhatsApp button remains in the body — a receipt is opened to send it. Edit / History / Void moved into a 3-dot button in the sheet header, beside Close.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3A.1 | Body holds ONE action | Open an active sale's receipt | Exactly one full-width button at the bottom: the green **Send on WhatsApp**. No Edit / History / Void bars anywhere in the body |
| 3A.2 | Menu button placement | Look at the sheet header | Title on the left; a 3-dot (`ellipsis-vertical`) icon then **Close** on the right |
| 3A.3 | Menu contents (admin, active sale) | Tap the 3-dot | ActionMenu opens titled "Sale Receipt" with: **Edit sale** (blue pencil), **History** (violet clock), **Void sale** (red, destructive) |
| 3A.4 | Non-admin | Sign in as `role='user'`, open a receipt | History is **absent** (audit reads are admin-only); Edit and Void still listed |
| 3A.5 | Voided sale | Open a voided sale, tap the 3-dot | Only **History** (admin) — a voided sale is a closed record. For a non-admin the 3-dot button is **hidden entirely** (no actions left) |
| 3A.6 | No `onEdit` prop | Open the receipt from a surface that passes no `onEdit` | Edit sale is absent; the rest of the menu is unaffected |
| 3A.7 | Colour vocabulary matches the row menu | Compare the 3-dot menu here with a sale card's 3-dot menu | Same glyphs and same colours for Edit / History / Void — both read `ICON_COLORS` |
| 3A.8 | Edit | Menu → Edit sale | Menu closes, the sale form opens on this sale (same as the row menu's Edit) |
| 3A.9 | History | Menu → History | Menu closes, the record history sheet opens over the receipt |
| 3A.10 | **Void scrolls the form into view** | Scroll the receipt to the BOTTOM (a multi-line sale with payments), then Menu → Void sale | The body scrolls back to the top and the void **reason form** is visible right under the hero. It must not be left off-screen |
| 3A.11 | Void form replaces the menu | After 3A.10, tap the 3-dot again | The button is **gone** while the reason form is open — every action is suppressed in void mode, so there is nothing to open |
| 3A.12 | **Menu does not wedge on void** | Repeat 3A.10, then Cancel the reason form, then tap the 3-dot again | The menu opens normally. The backdrop must never be left stuck and no tap may be dead — the action removes itself from the list mid-close, which is what `openActions` freezes |
| 3A.13 | Cancel restores the menu | After Cancel in 3A.12 | Edit / History / Void are all listed again |
| 3A.14 | Confirm void | Menu → Void sale → type a reason → Void | Behaves exactly as §4 — the trigger moved, the flow did not |
| 3A.15 | Drag still works | Press and drag **down** on the header near the 3-dot icon | The sheet drags/closes (the header is a `SheetDragArea`); a plain tap on the icon still opens the menu |
| 3A.16 | Unsaved-guard unaffected | Type a void reason, then tap Close | "Discard changes?" is still asked — the header menu did not break the dirty guard |
| 3A.17 | RTL | Switch to Arabic | The 3-dot and Close sit on the correct (leading) side; the menu rows read right-to-left |

---

## 4. Void a sale

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Open void flow | Receipt header 3-dot → "Void sale" (or a sale row's 3-dot → Void sale) | Void reason form / confirmation opens — see §3A.10 for the receipt path |
| 4.2 | Reason required | Leave reason blank | Void button disabled |
| 4.3 | Whitespace-only reason | Enter `"   "` | Service rejects: "A reason is required" |
| 4.4 | Confirm dialog | Enter reason, tap Void | ConfirmDialog: "Void Sale?" destructive style |
| 4.5 | Cancel | Tap Cancel | Returns to receipt, sale unchanged |
| 4.6 | Confirm void | Tap confirm | `voided_at`, `voided_by`, `void_reason` set on row. Sale disappears from active list |
| 4.7 | Audit trail | Inspect DB after void | Row still exists with all void fields populated |
| 4.8 | Dashboard impact, unpaid sale | Void a current-month sale with nothing collected | The sale and its bill are voided together and the debt disappears |
| 4.9 | Network error during void | Disable network, confirm | ErrorBanner; sale NOT voided |
| 4.10 | Permission gating | User role | Void available (or admin-only — verify gate; file as finding if unexpected) |
| 4.11 | **A paid sale IS voidable, and the message says so** | Void a fully-paid sale | The confirm states that any money collected is voided too and goes back to being uncollected. It is no longer refused — the old "Void the payment first" error is gone |
| 4.12 | Confirm a paid void | Confirm 4.11 | The sale, its bill **and** its hand-over are all voided. The money-in history shows the payment dimmed + **Voided**; the dashboard revenue and the collector's wallet each drop by that amount; the stock comes back |
| 4.13 | Installments | Void a sale paid in 2 installments | Both hand-overs are voided; the confirm wording is identical to 4.11 (no count) |
| 4.14 | **A hand-over covering other bills** | Collect one payment across a sale + a month, then void the sale | The confirm warns that a payment which also settled another bill is undone in full. Confirm — the **month** goes back to unpaid too, because one physical hand-over cannot be half-undone |
| 4.15 | Same message when nothing was collected | Open the void dialog on a pay-later sale | Same wording ("any money collected…") — it costs no read, so it does not vary by what is actually paid |
| 4.16 | **Opening the dialog costs no reads** | Select 20 paid sales → Void | The confirm appears instantly; watch the network / SQL log — nothing is queried until Confirm |
| 4.17 | Void order is safe | Inspect after 4.12 | Payments are voided **before** the sale, so an interrupted run leaves an unpaid sale (still owed) — never live cash on a voided sale |
| 4.18 | Audit after a paid void | Admin → Audit Log | A `sales` **void**, a `charges` **void** and a `collections` **void** entry per payment |
| 4.19 | Offline paid void | Void a paid sale offline, then sync | Sale, bill and payments all arrive voided; no balance goes negative |
| 4.20 | Bulk void speed | Select 10 paid sales → Void | Completes in roughly the time one takes — every hand-over goes in **one** write (`voidMany`), and the payments of the whole selection are gathered in one batch, not per sale |

---

## 5. Customer sales panel (CustomerSalesPanel)

Displayed at the **bottom** of the customer detail screen, below the payment grid and the details card. Shows a 5-sale preview with a "Show all" link to the full per-customer sales page.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Panel position | Open a customer detail | Sales panel is the LAST section, after the payment grid + details card |
| 5.2 | Empty panel | Customer has no sales | "No sales" empty state in panel; no "Show all" link |
| 5.3 | Sale card in panel | Look at a sale entry | Product name snapshot, amount in stored currency, date |
| 5.4 | Tap a sale in panel | Tap | SaleDetailSheet opens (same receipt as from Sales tab) |
| 5.5 | Walk-in sales excluded | Customer panel | Only sales linked to THIS customer; walk-ins (customer_id = null) do NOT appear |
| 5.6 | Voided sales excluded | Panel | Voided sales not shown |
| 5.7 | Snapshot rate in panel total | Panel shows amount | Converted via `rate_per_usd_snapshot` (not live rate) |
| 5.8 | Panel updates after void | Void a sale via receipt | Panel refreshes, sale disappears |
| 5.9 | Preview cap = 5 | Customer with ≤5 sales | All sales shown; NO "Show all" link |
| 5.10 | "Show all" link appears | Customer with >5 sales | Only 5 shown + "Show all" link below them |
| 5.11 | Record from panel | Tap "Record Sale" | Form opens pre-filled with this customer; on save the preview refreshes |
| 5.12 | Refresh sources | Record/void a sale **from the panel itself** | The preview reloads. **Known gap:** the panel loads on open and after its own writes only — no focus refresh and pull-to-refresh doesn't reach it — so a sale recorded/voided on the full "Show all" page shows here only after leaving and reopening the customer |
| 5.13 | Enter selection | Long-press a sale card in the panel | Checkboxes replace the card icons; the panel title + "Record" pill become `X · "1 selected" · [send-invoice icon]`; the row height does not jump |
| 5.14 | Tick more / untick | Tap other cards, then untick them all | Count follows the ticks; emptying the selection exits selection mode and the title row returns |
| 5.15 | Bulk send on WhatsApp | Select 2–3 sales → the receipt icon | ONE WhatsApp message covering every selected sale (same text as the Sales tab's bulk send); the selection clears; **no** sale is created, edited or voided |
| 5.16 | No select-all | While selecting | No select-all checkbox in the panel toolbar (only X, count, send) — unlike the Sales tab and the full page |
| 5.17 | No bulk void here | While selecting | Void is **not** offered in the panel; it stays on the receipt sheet / full page / Sales tab |
| 5.18 | "Show all" hidden while selecting | Customer with >5 sales → enter selection | The "Show all" link is hidden until the selection ends |
| 5.19 | Exit paths | X button · Android back · recording a new sale | Each leaves selection mode with nothing ticked |
| 5.20 | No phone | Customer with no phone → select sales → send | "No phone number for this customer" dialog; nothing sent; the selection stays |

---

## 5b. Full per-customer sales page (CustomerSalesListScreen)

Reached via the panel's "Show all" link. Route: `customers/[id]/sales`. Mirrors the Sales tab but locked to one customer (no customer filter).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5b.1 | Open full list | Tap "Show all" on a customer with >5 sales | Full-screen list titled "Sales" with the customer name as subtitle + back button |
| 5b.2 | Customer-scoped only | Inspect rows | Every row belongs to THIS customer; no other customers' sales, no walk-ins |
| 5b.3 | All sales regardless of branch | Tenant-wide admin with a branch filter active | Page shows ALL of the customer's sales — branch filter is NOT applied here |
| 5b.4 | Infinite scroll | Customer with >30 (PAGE_SIZE) sales | Scrolling to the end loads the next page |
| 5b.5 | Search | Type a product name in the search box | List filters to matching sales for this customer (debounced) |
| 5b.6 | Pull to refresh | Pull down | List re-fetches page 0 |
| 5b.7 | Record FAB | Tap the + FAB | SaleFormSheet opens pre-filled with this customer; on save the list refreshes |
| 5b.8 | Tap a sale | Tap a row | SaleDetailSheet (receipt) opens |
| 5b.9 | Void from full page | Void via the receipt | Sale disappears from the list after refresh |
| 5b.10 | Empty + search | Search a term with no matches | Empty state shown; the "Record Sale" action is hidden while searching |
| 5b.11 | No Sales-tab collision | Set a customer filter on the Sales tab, open a different customer's full page, return to Sales tab | The Sales tab still shows its own filter/list — unchanged by the per-customer page |
| 5b.12 | RTL | Arabic language | Header, search box, list, FAB, and the panel "Show all" chevron all mirror correctly |

---

## 6. Dashboard revenue integration

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
**Revenue counts CASH, not the invoice.** `salesRevenue` sums the cash that settled **sale bills**, never `total_amount` — so a partial sale adds only what was collected, and the remainder enters revenue in the month it is collected, still as **sales** revenue. `salesCount` still counts every sale header.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Fully-paid sale included in revenue | Record a $50 sale, collect $50, open Dashboard | Hero card `monthlyRevenue` increases by $50 |
| 6.1a | Partial sale adds only the cash | Record a $100 sale, collect $30 | `salesRevenue` +$30 (NOT +$100). The $70 appears in Debts. `salesCount` +1 |
| 6.1b | Fully-unpaid sale adds nothing | Record a $100 sale, collect $0 | `salesRevenue` unchanged; `salesCount` +1; $100 shows as a Sales debt |
| 6.1c | Collecting the remainder | Then collect the sale's remaining $70 | `monthlyRevenue` +$70, counted under **Sales**; the sale row is untouched; total across both months = exactly $100 |
| 6.2 | Breakdown sub-line visible | Two or more streams non-zero this month | Sub-line lists each non-zero stream (Subscriptions / Sales / Debts) with its amount |
| 6.3 | Breakdown sub-line hidden | Only one stream earned this month | Sub-line not rendered |
| 6.4 | Snapshot conversion | Record a fully-paid 50,000 LBP sale (rate 50,000 → $1), open Dashboard | Dashboard shows +$1 from that sale |
| 6.5 | Voided sale excluded | Record then void a sale | Dashboard revenue decrements by the collected amount only |
| 6.6 | Walk-in included | Walk-in (no customer) sale | Included in salesRevenue |
| 6.7 | Branch filter | Tenant-wide admin filters to branch A | Only branch A sales in revenue |
| 6.8 | Previous-month sale | Sale recorded in last month | NOT in current month's salesRevenue |
| 6.9 | Sales tab header is VALUE SOLD | Compare a month's section-header total to that month's `salesRevenue` | They differ when a sale was not paid in full that month — the header sums `total_amount` (what was sold), revenue sums the cash |

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
| Edit sale (non-voided) | ✓ | ✓ | ✓ |
| Edit a **voided** sale | ✗ | ✗ | ✗ |
| Void sale | ✓ | ✓ | ⚠ Verify gate |
| Open the row 3-dot menu | ✓ | ✓ | ✓ |
| Read a sale's History from the menu | ✓ | ✓ | ✗ ("Admins only" — the row is offered, the read returns nothing) |
| View customer sales panel | ✓ | ✓ | ✓ |
