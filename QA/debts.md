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
2. **Debt payments are tied only to the customer** — recording one does NOT change any payment/sale row. A partial month still shows "partial" in the month grid after its debt is paid off; only the Debts total drops.
3. **Categories:** months = partial `payments` (`balance > 0`, non-voided); sales = partial `sales` (`total_amount − amount_paid > 0`, non-voided, has a customer); services = reserved (always 0 today); custom = `custom_debts` rows.
4. **Currency:** every custom debt + debt payment freezes `rate_per_usd_snapshot`. Totals are summed in USD via each row's snapshot, then formatted into the display currency — never drift when the live rate changes.
5. **No hard delete.** Custom debts + debt payments void via `voided_at`/`voided_by`/`void_reason`; voided rows drop from the totals but stay in DB.
6. **Branch scoping via the customer** (RLS `EXISTS`; offline joins `customers`). Walk-in sales (no customer) never appear as debts.
7. **Tenant isolation via RLS.** No tier gating — recording debts/payments is unlimited.

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
| 1b.8 | Void payment from modal | In the modal, tap a debt-payment row → confirm | Payment voided; net rises back |
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
| 2.6 | Underlying row untouched | Partial month (balance 50) → record a 50 debt payment | Net for that customer drops to 0; the month grid still shows the month as "partial" |

---

## 3. Voiding + credit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Void custom debt | In a debtor's detail modal, tap a Custom row → confirm | Row disappears; total drops; row still in DB (voided) |
| 3.2 | Void debt payment | In a debtor's detail modal, tap a debt-payment row → confirm | Row disappears; net debt rises back up |
| 3.3 | Months/sales not voidable here | Tap a Months or Sales row in the modal | No void prompt (void the underlying payment/sale in its own tab) |
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
