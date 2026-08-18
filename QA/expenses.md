# Expenses & Net Income — QA Scenarios

Covers money OUT: hand-typed expenses, the cost of buying stock, and the net-income figures on the dashboard. Money IN is covered by [payments.md](payments.md), [sales.md](sales.md) and [debts.md](debts.md); the stock ledger itself by [products.md](products.md).

**Reference code:**
- Service (composes both sources): [ExpenseService.ts](../SubsTrack/src/modules/transaction/expenses/services/ExpenseService.ts)
- Repository (stored rows only): [ExpenseRepository.ts](../SubsTrack/src/modules/transaction/expenses/repository/ExpenseRepository.ts) · [.offline](../SubsTrack/src/modules/transaction/expenses/repository/ExpenseRepository.offline.ts)
- Derived stock costs: `stockCostsInRange` in [ProductRepository.ts](../SubsTrack/src/modules/admin/products/repository/ProductRepository.ts)
- Panel: [ExpensesPanel.tsx](../SubsTrack/src/modules/transaction/expenses/screens/ExpensesPanel.tsx)
- Form: [ExpenseFormSheet.tsx](../SubsTrack/src/modules/transaction/expenses/components/ExpenseFormSheet.tsx)
- Cost entry: [ProductStockSheet.tsx](../SubsTrack/src/modules/admin/products/components/ProductStockSheet.tsx) · [ProductBatchRestockSheet.tsx](../SubsTrack/src/modules/admin/products/components/ProductBatchRestockSheet.tsx) · [ProductFormSheet.tsx](../SubsTrack/src/modules/admin/products/components/ProductFormSheet.tsx)
- Dashboard: [DashboardService.ts](../SubsTrack/src/modules/dashboard/services/DashboardService.ts) · [DashboardScreen.tsx](../SubsTrack/src/modules/dashboard/screens/DashboardScreen.tsx)

**Core rules under test:**
- Expenses are **admin-only**, read and write (RLS + UI).
- A stock purchase is an expense in the month it was **paid for** (cash basis), never the month the goods sell.
- A restock cost is **derived** from `stock_movements.unit_cost` — there is no expense row to void.
- `monthlyRevenue` stays **gross**; `netIncome` is the subtraction.

---

## 1. Recording a custom expense

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Add an expense | Admin → Transactions → Expenses → FAB → category Rent, 400 USD, today, save | Row appears in the current-month section; the header total grows by $400 |
| 1.2 | Category is required-by-default | Open the form without touching the category | Defaults to Rent; save works |
| 1.3 | Amount must be positive | Enter 0 or leave blank | Save is disabled |
| 1.4 | Amount typed as `0.35` | Type `0.35` in the amount field | The leading zero survives; the value is not cleared while typing |
| 1.5 | No description | Save with the description empty | Row label falls back to the category name ("Rent"), never blank |
| 1.6 | Back-dated expense | Set the date to last month | Row files under last month's section, not "Today" |
| 1.7 | Future date blocked | Open the date picker | Days after today are not selectable |
| 1.8 | Non-USD expense | Record 5,000,000 LBP | The card shows the LBP amount; the header total converts it at the current rate |
| 1.9 | Rate is frozen | Record an LBP expense, then edit the currency's live rate in Admin → Currencies | The expense's USD contribution does not change |
| 1.10 | Unsaved-changes guard | Type an amount, then drag the sheet down | Discard prompt appears (see [unsaved-changes.md](unsaved-changes.md)) |
| 1.11 | Currency alone isn't dirty | Open the form and close it without typing | No discard prompt (CurrencyInput self-seeds the currency) |
| 1.12 | Quick action | 3-dot menu on any screen → Add expense | Same form opens, standalone |

## 2. Removing an expense

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Void a manual expense | Row 3-dot → Remove → confirm | Row disappears; header total and dashboard net revert |
| 2.2 | Cancel the confirm | Choose Cancel | Nothing changes |
| 2.3 | No edit action | Open a row's 3-dot menu | Only Remove (a wrong expense is voided and re-entered — there is no edit) |
| 2.4 | Derived stock row can't be voided | Open a "From stock" row's 3-dot | Only "Open product"; no Remove |

## 3. Stock purchase → expense

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Restock with a cost | Product stock sheet → Add 100, cost/unit 0.35 → save | "Total cost $35.00" preview shows before saving; Expenses gains a `Water ×100` row of $35 |
| 3.2 | Cost pre-fills | Set the product's cost price to 0.35, then open the stock sheet | Cost/unit is pre-filled with 0.35 |
| 3.3 | Restock with no cost | Clear the cost field and save | Stock still increases; **no** expense row is created |
| 3.4 | Remove mode has no cost | Switch the stock sheet to Remove | The cost field and total disappear — stock loss is not an expense |
| 3.5 | Opening stock is costed | Create a product with cost price 0.35 and starting stock 20 | An `initial` movement is written and Expenses shows $7.00 today |
| 3.6 | A sale never costs | Record a sale of 5 units | Expenses is unchanged (only positive movements carry a cost) |
| 3.7 | Voiding a sale | Void that sale | Expenses still unchanged |
| 3.8 | Legacy movements | Restocks recorded before this feature | Contribute $0 and never appear in Expenses |
| 3.9 | Correcting a wrong cost | Restock 100 @ 0.35, realise it was 0.30 | The fix is a stock adjustment / a new movement — the old row cannot be edited or voided from Expenses |

## 4. Batch restock costs

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Cost line appears on pick | Set a quantity on a row | A "Cost per unit" line opens under that row only |
| 4.2 | Cost pre-fills per product | Pick two products with cost prices | Each row seeds its own catalog cost |
| 4.3 | First pick sets the currency | Pick a product whose cost price is in LBP | The delivery currency becomes LBP |
| 4.4 | Changing the delivery currency re-prices | Switch LBP → USD | Every picked row's cost is converted from its catalog cost |
| 4.5 | Total cost summary | Two rows: 10 @ 0.35 and 5 @ 1.00 | Summary shows "+15" and total cost 8.50 |
| 4.6 | Mixed costed / uncosted | Leave one row's cost empty | Only the costed rows contribute to the total and to Expenses |
| 4.7 | Clear resets costs | Tap Clear | Quantities **and** costs clear; the form stops being dirty |
| 4.8 | One row per product | Save a 3-product delivery | Three `restock` movements and three Expenses rows (no "batch" grouping row) |
| 4.9 | Search keeps typed values | Type quantities, then search | Filtering the list does not lose the quantities or costs |

## 5. Cash basis (the timing rule)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Buy one month, sell the next | Restock 100 @ 0.35 in August; sell 60 @ 1.00 in September | August: expense $35, income $0. September: expense $0, income $60 |
| 5.2 | Unsold stock is not a loss | After 5.1, look at August | Net is −$35; the unsold 40 units are stock, not an expense reversal |
| 5.3 | Expense date, not entry date | Enter last month's rent today | It counts against **last** month, not this one |

## 6. Dashboard

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | No expenses at all | Tenant that has never recorded one | Hero shows no Expenses chip and no Net line; no Expenses/Net tiles |
| 6.2 | Expenses chip | Record $1,240 of expenses this month | Orange `Expenses −$1,240.00` chip sits beside the red "Owed by customers" chip |
| 6.3 | Net line | Revenue $4,820, expenses $1,240 | Hero shows Net $3,580.00 |
| 6.4 | Negative net | Expenses greater than revenue | Net renders in red with a leading minus |
| 6.5 | Revenue stays gross | Compare the big number before/after adding an expense | The Revenue headline does not move |
| 6.6 | vs-last-month pill | Add an expense | The ▲/▼ pill still compares **revenue**, not net |
| 6.7 | Expenses tile breakdown | Mix of stock and custom expenses | Sub-line reads "Stock $X · Other $Y", and the two sum to the tile value |
| 6.8 | Net tile sub-line | Look at the Net tile | Reads "In {revenue} · Out {expenses}" |

## 7. Permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Collector sees no segment | Login as `role: 'user'` → Transactions | Segments are Debts / Sales / Services — no Expenses |
| 7.2 | Collector quick action | Open the 3-dot menu | No "Add expense" item |
| 7.3 | Collector dashboard | Look at home | No Expenses chip, no Net line, no Expenses/Net tiles |
| 7.4 | RLS holds | With a collector's session, query `expenses` directly | Zero rows returned, insert rejected |
| 7.5 | Branch admin | Login as an admin with a branch | Sees the segment; only their branch's expenses plus company-wide ones |

## 8. Branches

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Company-wide expense | Tenant-wide admin picks "Company-wide (no branch)" | Appears in the **All branches** view only — deliberately not inside Branch A or Branch B, or comparing branches would count it twice. Reachable on its own via the "Unassigned" branch chip |
| 8.2 | Branch expense | Assign it to Branch A | Visible in Branch A and All branches; not in Branch B |
| 8.3 | Branch-scoped admin can't choose | Login as a branch admin and open the form | The branch picker is locked to their branch |
| 8.4 | **Shared product's restock is company-wide** | Restock a product with `branch_id = NULL` | The cost appears **only** in the All-branches view — not under every branch (see gotcha #88) |
| 8.5 | Branch product's restock | Restock a Branch A product | Cost appears in Branch A and in All branches |
| 8.6 | Branch totals add up | Sum Branch A + Branch B expense totals | No purchase is double-counted across branches |

## 9. Filters & list

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Default window | Open the panel | Shows the current calendar month |
| 9.2 | Date range | Set From/To to cover 3 months | Rows and section headers cover all three; totals recompute |
| 9.3 | Category filter | Pick Rent | Only rent rows; the headline total follows the filter |
| 9.4 | Stock category | Pick Stock | Only derived rows |
| 9.5 | Search | Type part of a label | Client-side filter, no refetch |
| 9.6 | Clear filters | Tap Clear filters | Back to the current month, all categories, empty search |
| 9.7 | Section totals | Look at a month header | Total is the negated sum of that section's rows |
| 9.8 | Empty period | Pick a range with nothing in it | Empty state with the "stock is counted automatically" hint |
| 9.9 | Sort order | Mixed manual and stock rows | Strictly newest-first by the date the money went out |
| 9.10 | Amounts read as outflow | Look at any row | Amount carries a leading `−` |

## 10. Offline (native)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Add offline | Airplane mode → add an expense | Appears immediately in the list and the dashboard |
| 10.2 | Costed restock offline | Airplane mode → restock with a cost | The derived expense row appears |
| 10.3 | Push on reconnect | Go online, let sync run | Both land in Supabase with the correct frozen rate |
| 10.4 | Void offline | Airplane mode → remove an expense | Disappears locally; the void pushes on reconnect |
| 10.5 | Two devices | Add on A, sync, pull on B | Row appears on B |
| 10.6 | Schema self-heals | Update an existing install (OTA) | `applySchema` adds `expenses` plus the new product/movement columns with no reinstall |
| 10.7 | Collector's mirror | Sync as a collector | `expenses` stays empty locally (RLS returns nothing) |
| 10.8 | Logout clears it | Log out, log in as another tenant | No expenses leak across tenants |
