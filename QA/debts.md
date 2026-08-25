# Debts — QA Scenarios

Covers the per-customer debt ledger (Transactions → **Debts** tab — a **single debtors list**, no sub-tabs): the runtime-computed net debt, the four debt categories (months / sales / services / custom), the debtors overview + detail modal (with add/pay/void inside), adding a custom debt, recording a debt payment, and voiding either. A customer's net debt is **computed at runtime** (`net = Σ category debts − Σ debt payments`) — nothing is stored except `custom_debts` and `debt_payments`.

**Reference code:**
- Panel: [DebtsPanel.tsx](SubsTrack/src/modules/debts/screens/DebtsPanel.tsx) (single debtors list)
- Cards: [DebtItemCard.tsx](SubsTrack/src/modules/debts/components/DebtItemCard.tsx), [DebtPaymentCard.tsx](SubsTrack/src/modules/debts/components/DebtPaymentCard.tsx), [DebtorCard.tsx](SubsTrack/src/modules/debts/components/DebtorCard.tsx)
- Shared list: [DebtList.tsx](SubsTrack/src/modules/debts/components/DebtList.tsx) (Debtor modal + customer-detail panel), Debtor modal: [DebtorDetailSheet.tsx](SubsTrack/src/modules/debts/components/DebtorDetailSheet.tsx)
- Form sheets: [CustomDebtFormSheet.tsx](SubsTrack/src/modules/debts/components/CustomDebtFormSheet.tsx), [DebtPaymentFormSheet.tsx](SubsTrack/src/modules/debts/components/DebtPaymentFormSheet.tsx)
- Service: [DebtService.ts](SubsTrack/src/modules/debts/services/DebtService.ts); client-side aggregation: [debtAggregations.ts](SubsTrack/src/modules/debts/utils/debtAggregations.ts) (`sumDebtNetUsd`, `groupDebtors`)
- Repository: [DebtRepository.ts](SubsTrack/src/modules/debts/repository/DebtRepository.ts) (+ `.offline`)
- Slice: [debtSlice.ts](SubsTrack/src/state/slices/debts/debtSlice.ts) (holds the full branch set; debtors grouping + summary are client-side)
- Partial reads: `PaymentService.getPartialPayments`, `SaleService.getPartialSales`
- Hub: [TransactionsScreen.tsx](SubsTrack/src/modules/transactions/screens/TransactionsScreen.tsx)

---

## 0. Critical invariants

1. **Net debt is computed at runtime**, never stored: `net = Σ(category debts) − Σ(debt payments)`.
2. **Debt payments are tied only to the customer** — recording one does NOT change any payment/sale row. A partially-paid month shows as **paid (green)** in the month grid (never "partial" — there is no partial cell state); paying off its debt only lowers the Debts total, and the month/grid stay unchanged.
3. **Categories:** months = partial `payments` (`balance > 0`, non-voided); sales = partial `sales` (`total_amount − amount_paid > 0`, non-voided, has a customer); services = reserved (always 0 today); custom = `custom_debts` rows.
4. **Currency:** every custom debt + debt payment freezes `rate_per_usd_snapshot`. Totals are summed in USD via each row's snapshot, then formatted into the display currency — never drift when the live rate changes.
5. **No hard delete.** Custom debts + debt payments void via `voided_at`/`voided_by`/`void_reason`; voided rows drop from the totals but stay in DB.
6. **Branch scoping via the customer** (RLS `EXISTS`; offline joins `customers`). Walk-in sales (no customer) never appear as debts.
7. **Tenant isolation via RLS.** No tier gating — recording debts/payments is unlimited.
8. **A debt payment is revenue.** Dashboard revenue counts cash, so collecting a debt adds to `debtRevenue` (and `monthlyRevenue`) in the calendar month of its `paid_at` — this is where the unpaid part of a partial payment/sale finally lands. It never retroactively changes the source row's month. Voiding a debt payment removes it from revenue and restores the debt.

---

## 1. Debtors list + summary

The panel is a **single debtors list** (no sub-tabs). A net-total summary header sits on top, then a name search, then one row per customer who still owes money. The FAB opens the add menu.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Open Debts tab | Transactions → Debts | The debtors list shows; summary header shows total outstanding for the current branch scope |
| 1.2 | Empty state | Tenant with no debts | "No debtors" empty state; FAB visible |
| 1.3 | Months debt appears | Record a partial subscription payment (paid < due) | The customer appears / their net rises by the remaining balance (Months category, seen in their detail modal) |
| 1.4 | Sales debt appears | Record a sale, choose **Partial**, pay less than total | The customer's net rises by `total − paid` (Sales category in their detail modal) |
| 1.5 | Full sale = no debt | Record a sale as **Full** | No debt for that sale |
| 1.6 | Custom debt appears | FAB → Add custom debt | The customer's net rises; a Custom row shows in their detail modal |
| 1.7 | Summary math | Note total; add a custom debt of X | Total outstanding increases by X (converted to display currency) |
| 1.8 | Search debtors | Type part of a customer name in the search box | List filters to matching debtors (client-side, by name); no re-fetch/spinner |

---

## 1b. Debtor detail modal (with add / pay / void)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1b.1 | Debtor list | List with several partial/custom debts | One row per customer with a positive net, sorted **highest owed first**; each row shows the net in the display currency |
| 1b.2 | Credit customers excluded | A customer whose debt payments ≥ their debts | That customer does NOT appear in the Debtors list (consistent with the customer-list debt badge) |
| 1b.3 | Open detail modal | Tap a debtor row | A `pageSheet` modal opens: customer name + net (or **Credit**), a **Debts history** section above a **Debt payments history** section |
| 1b.4 | Modal = customer-detail list | Compare the modal to the same customer's detail-page **Transactions** panel | Same rows (both use the shared `DebtList`) |
| 1b.5 | Add debt from modal | In the modal, header **"+" menu** → Add custom debt → amount → save | Customer is pre-filled (read-only, locked to this debtor); debt appears in the modal's Debts history live; net rises |
| 1b.6 | Add payment from modal | In the modal, header **"+" menu** → Record debt payment → amount → save | Payment appears in Debt payments history live; net drops |
| 1b.7 | Pay a debt row from modal | In the modal, a debt row's menu → **Pay** → confirm | A debt payment is recorded; net drops; on returning to the list the debtor reflects the new net (or drops off if settled) |
| 1b.8 | Void payment from modal | In the modal, a debt-payment row's **3-dot menu** → **Remove** → confirm | Payment voided; net rises back |
| 1b.9 | Pay full from row menu | On a debtor row, 3-dot menu → **Pay full debt** → confirm | A single USD debt payment clears the whole net; row drops off the list |

---

## 2. Recording (FAB, picker-driven)

The FAB add menu (Add custom debt / Record debt payment) is **picker-driven** — no customer is pre-scoped, so you pick the customer in the form.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Add custom debt | FAB → Add custom debt → pick customer, amount, description → save | Debt recorded; the debtor's net rises |
| 2.2 | Custom debt requires customer + amount | Leave customer or amount empty | Submit disabled |
| 2.3 | Record debt payment | FAB → Record debt payment → pick customer, amount → save | Net debt drops by the amount |
| 2.5 | Currency snapshot | Record a debt payment in LBP, then edit the tenant LBP rate | The payment's contribution to the net (in USD/display) does NOT change |
| 2.6 | Underlying row untouched | Partial month (balance 50) → record a 50 debt payment | Net for that customer drops to 0; the month grid still shows the month as **paid (green)** — the underlying payment row (and its `balance`) is untouched |

---

## 3. Voiding + credit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Void custom debt | In a debtor's detail modal, a Custom row's 3-dot menu → **Remove** → confirm | Row disappears; total drops; row still in DB (voided) |
| 3.2 | Void debt payment | In a debtor's detail modal, a debt-payment row's 3-dot menu → **Remove** → confirm | Row disappears; net debt rises back up |
| 3.3 | Months/sales not voidable here | Open a Months or Sales row's 3-dot menu in the modal | Only **Pay** is offered — no Remove (void the underlying payment/sale in its own tab) |
| 3.4 | Credit (overpayment) | Record debt payments exceeding total debt | Header shows a green **Credit** amount (net negative), not a debtor total |

---

## 4. Branch + offline

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Branch scoping | As a branch-scoped user | Only debts of customers in that branch appear |
| 4.2 | Branch switch (tenant-wide admin) | Switch the BranchSelector | List + summary re-scope to the selected branch |
| 4.3 | Offline add | Airplane mode → add a custom debt + a debt payment | Both persist and show immediately; net updates |
| 4.4 | Sync on reconnect | Reconnect | Sync pill runs; the rows land in Supabase |
| 4.5 | Fresh install pull | Wipe local data → log in | Custom debts + debt payments pull down and totals match |
| 4.6 | Legacy sales | Sales recorded before this feature | Show as fully paid (no phantom debt) |

---

## 5. Debt history (clock icon)

The clock icon on the net-total summary card opens a **branch-wide** log of debts + payments together, grouped by **when each was recorded**. Its rows carry the same 3-dot actions as every other debt surface — see **5d**.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Open history | Tap the clock icon on the total card | A sheet opens titled "Debt history" |
| 5.2 | Merged + ordered | With both debts and debt payments present | Debts and payments appear in one list, newest first, mixed by recorded date (not two separate sections) |
| 5.3 | Grouped by recorded date | Rows across several days/months | Rows sit under date headers (Today / This Week / This Month / `<Month> <Year>`), like the Payments/Sales tabs |
| 5.4 | Debts + payments totals side by side | A group holding both a new debt and a debt payment | The header shows **two** amounts: the debts total in **red** with a leading `+`, and the payments total in **green** with a leading `−`. They are NOT subtracted into one net figure |
| 5.5 | Rows are actionable | Tap a debt or payment row's **3-dot menu** | A menu opens — the history is no longer read-only; full coverage in **5d** |
| 5.6 | Customer names shown | Multiple debtors | Each row shows the customer name (this is a cross-customer view) |
| 5.7 | Empty state | A branch with no debts or payments | "No history yet" empty message |
| 5.8 | Branch scope | Branch-scoped user / switched branch | History shows only the current branch's debts + payments |

### 5a. Grouping uses the recorded date, never the billing month

A subscription debt is *about* a billing month but was *created* the day the short payment was recorded. These two dates can be years apart — grouping must always use the second.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5a.1 | Future billing month | Today, record a **partial** payment for a billing month far in the future (e.g. Nov 2027) → open Debt history | The row appears under **TODAY**, not under "November 2027". No future-dated group is created |
| 5a.2 | Past billing month | Record a partial payment today for a **past** month (e.g. Sep 2026 while it is Aug 2026… or any earlier month) | The row appears under **TODAY**, not under that past month |
| 5a.3 | Card still shows the billing month | The same row from 5a.1 | The card's own subtitle still reads the plan + the **billing month** date — only the grouping changed |
| 5a.4 | Sales debt | Record a partial sale today | Appears under TODAY (sold-at = recorded date, so this was always correct) |
| 5a.5 | Custom debt | Add a custom debt today | Appears under TODAY |
| 5a.6 | Debt payment | Record a debt payment today | Appears under TODAY, in green |
| 5a.7 | Order across categories | Mix a month debt (future billing month), a sale debt and a custom debt recorded minutes apart | Ordered by **recorded time**, newest first — the future billing month does not jump to the top |
| 5a.8 | Debtor detail list matches | Open a debtor's detail sheet with the same mix | The same recorded-date ordering as the history sheet (both read `DebtItem.createdAt`) |

---

## 6. Customer detail page — Debts panel actions

The Debts panel on a customer's detail page now carries the **same row actions** as the Debts tab (it shares one `useDebtRowActions` hook). Unlike the tab, the panel reads its data itself, so every action must refresh the panel too.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Debt row menu | Customer detail → Debts panel → a debt row's **3-dot menu** | Menu opens with **Pay** (and **Remove** only on a Custom row) — identical to the debtor modal |
| 6.2 | Pay a debt row | A debt row's menu → **Pay** → confirm | A debt payment for the row's remaining amount is recorded in the **row's own currency**; the row disappears from the panel and the panel's net drops — **without leaving the page** |
| 6.3 | Remove a custom debt | A Custom row's menu → **Remove** → confirm | Row disappears from the panel live; net drops |
| 6.4 | Months/sales have no Remove | Open a Months or Sales row's menu | Only **Pay** — no Remove (void the underlying payment/sale in its own tab) |
| 6.5 | Remove a debt payment | A debt-payment row's **3-dot menu** → **Remove** → confirm | Payment disappears from the panel live; net rises back up |
| 6.6 | Tapping a row does nothing | Tap a debt or debt-payment row's body (not the 3-dot) | Nothing happens — actions are menu-only on both surfaces (the old tap-to-void on payment rows is gone) |
| 6.7 | Cancel leaves it alone | Open any action → cancel the confirm dialog | No debt payment recorded, nothing voided, panel unchanged |
| 6.8 | Debts tab agrees | Do 6.2 / 6.3 / 6.5, then open Transactions → Debts | The tab's debtors list + net already reflect the change (no manual refresh) — the action goes through the shared slice |
| 6.9 | Customer-list debt badge agrees | Pay off a customer's whole debt from the panel, then open the customer list | The **Has debts** badge/tab no longer includes that customer (`netByCustomer` was refreshed) |
| 6.10 | Panel net after payoff | Pay every debt row from the panel | The panel's header amount reaches 0 and the list shows the "no transactions" empty message only if no payments remain |
| 6.11 | Offline | Airplane mode → pay a debt row from the panel | Works and shows immediately; syncs on reconnect |

### 5c. One-sided groups

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5c.1 | Debts only | A group holding only new debts | Only the red `+` total is shown; no green `−$0.00` |
| 5c.2 | Payments only | A group holding only debt payments | Only the green `−` total is shown; no red `+$0.00` |
| 5c.3 | Display currency | Set a non-USD display currency | Both totals are converted and formatted in that currency |
| 5c.4 | Mixed currencies in one group | Debts recorded in two different currencies | Each side sums in USD via its own frozen snapshot rate, then formats once |
| 5c.5 | RTL | Switch to Arabic | The two totals stay in the same reading order and do not overlap the title |

### 5b. Group separators (shared by Payments / Sales / Debt history)

`MonthSectionHeader` is one shared component, so every grouped list must behave identically here.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5b.1 | Separator between groups | A list with 2+ month groups | A short **centered** bar (~64px wide, 3px thick, rounded) + extra space sits above every group header except the first — never a full-width rule |
| 5b.2 | No bar above the first group | Same list, scrolled to top | The topmost header has **no** bar above it (nothing floating under the list padding) |
| 5b.3 | Single group only | A list whose rows all fall in one bucket | No separator anywhere |
| 5b.4 | Day/week buckets included | Rows in Today + This Week + older months | Rules appear between Today→This Week→month groups too, not only between months |
| 5b.5 | Pagination | Scroll to load more pages (Payments / Sales) | Newly appended groups get their separators; the first group keeps none |
| 5b.6 | All three lists match | Compare Payments tab, Sales tab, Debt history | Identical separator spacing and colour in all three |

### 5d. Row actions in the history (same hook as every other debt surface)

The history sheet gets its row actions from `DebtsPanel`, which passes the very same `useDebtRowActions` handlers the debtor modal uses — so a menu here must behave identically to the same row in the debtor modal or the customer panel. The sheet renders the slice's own data, so every change must show **without closing the sheet**.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5d.1 | Debt row menu | History → a debt row's **3-dot menu** | Menu opens with **Pay** (and **Remove** only on a Custom row) — identical to the debtor modal |
| 5d.2 | Months/sales have no Remove | Open a Months or Sales row's menu | Only **Pay** — no Remove (void the underlying payment/sale in its own tab) |
| 5d.3 | Pay a debt from the history | A debt row's menu → **Pay** → confirm | A debt payment for the row's remaining amount is recorded in the **row's own currency**; the debt row leaves the list and a green payment row appears under **TODAY** — the sheet stays open |
| 5d.4 | Remove a custom debt | A Custom row's menu → **Remove** → confirm | Row disappears live |
| 5d.5 | Remove a debt payment | A debt-payment row's menu → **Remove** → confirm | Row disappears live |
| 5d.6 | Section totals re-sum | Do 5d.3, then read the date headers | The row's old group loses it from the red `+` side; TODAY gains it on the green `−` side. No stale totals |
| 5d.7 | Net behind the sheet | Close the sheet after any of 5d.3–5d.5 | The Debts tab total + debtors list already reflect the change (the actions go through the shared slice) |
| 5d.8 | Menu title names the customer | Open a **debt** row's menu and a **debt-payment** row's menu | Both are titled with the **customer name** — this is a cross-customer list. (On the customer panel / debtor modal, a payment row's menu keeps its label title) |
| 5d.9 | Tapping the row body does nothing | Tap a row's body (not the 3-dot) | Nothing happens — actions are menu-only on every debt surface |
| 5d.10 | Cancel leaves it alone | Open any action → cancel the confirm dialog | Nothing recorded, nothing voided, the list is unchanged |
| 5d.11 | Scrolled-down row | Scroll deep into a long history, open a row's menu | The menu opens over the correct row and its action hits that row (the list is virtualized — the menu must not act on a recycled row) |
| 5d.12 | Pay the last debt | Pay off the only outstanding debt from the history | The debt row goes, the payment row stays, and the sheet does **not** fall back to the empty state |
| 5d.13 | Offline | Airplane mode → pay a debt row from the history | Works and shows immediately; syncs on reconnect |
| 5d.14 | RTL | Arabic → open a row menu | Title, icons and labels mirror correctly; the confirm dialog reads right-to-left |
