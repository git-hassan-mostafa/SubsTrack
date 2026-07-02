# Debts — QA Scenarios

Covers the per-customer debt ledger (Transactions → **Debts** tab): the runtime-computed net debt, the four debt categories (months / sales / services / custom), adding a custom debt, recording a debt payment, and voiding either. A customer's net debt is **computed at runtime** (`net = Σ category debts − Σ debt payments`) — nothing is stored except `custom_debts` and `debt_payments`.

**Reference code:**
- Panel: [DebtsPanel.tsx](SubsTrack/src/modules/debts/screens/DebtsPanel.tsx)
- Cards: [DebtItemCard.tsx](SubsTrack/src/modules/debts/components/DebtItemCard.tsx), [DebtPaymentCard.tsx](SubsTrack/src/modules/debts/components/DebtPaymentCard.tsx)
- Form sheets: [CustomDebtFormSheet.tsx](SubsTrack/src/modules/debts/components/CustomDebtFormSheet.tsx), [DebtPaymentFormSheet.tsx](SubsTrack/src/modules/debts/components/DebtPaymentFormSheet.tsx)
- Service: [DebtService.ts](SubsTrack/src/modules/debts/services/DebtService.ts)
- Repository: [DebtRepository.ts](SubsTrack/src/modules/debts/repository/DebtRepository.ts) (+ `.offline`)
- Slice: [debtSlice.ts](SubsTrack/src/state/slices/debts/debtSlice.ts)
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

## 1. Debts list + summary

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Open Debts tab | Transactions → Debts | List loads; summary header shows total outstanding for the current branch scope |
| 1.2 | Empty state | Tenant with no debts | "No debts" empty state; FAB visible |
| 1.3 | Months debt appears | Record a partial subscription payment (paid < due) | A row appears under category **Months** with the remaining balance |
| 1.4 | Sales debt appears | Record a sale, choose **Partial**, pay less than total | A row appears under **Sales** with `total − paid` remaining |
| 1.5 | Full sale = no debt | Record a sale as **Full** | No debt row for that sale |
| 1.6 | Custom debt appears | Add a custom debt | Row appears under **Custom** with its description + amount |
| 1.7 | Summary math | Note total; add a custom debt of X | Total outstanding increases by X (converted to display currency) |
| 1.8 | Category filter | Tap the category chip → Months / Sales / Custom | List shows only that category; summary total is unchanged (scope-wide) |
| 1.9 | Payments view | Category chip → **Payments** | List switches to debt-payment rows |
| 1.10 | Customer filter | Pick a customer | List + summary scope to that customer; header shows the customer name + their net |
| 1.11 | Clear filters | Tap "Clear filters" | Category resets to All, customer cleared, list re-fetches |

---

## 2. Recording

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Add custom debt | FAB → Add custom debt → pick customer, amount, description → save | Debt appears under Custom; total rises |
| 2.2 | Custom debt requires customer + amount | Leave customer or amount empty | Submit disabled |
| 2.3 | Record debt payment | FAB → Record debt payment → pick customer, amount → save | Payment appears under Payments; net debt drops by the amount |
| 2.4 | Pre-filled customer | With a customer filter active, open either form | Customer is pre-filled (read-only) |
| 2.5 | Currency snapshot | Record a debt payment in LBP, then edit the tenant LBP rate | The payment's contribution to the net (in USD/display) does NOT change |
| 2.6 | Underlying row untouched | Partial month (balance 50) → record a 50 debt payment | Net for that customer drops to 0; the month grid still shows the month as "partial" |

---

## 3. Voiding + credit

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Void custom debt | Tap a Custom row → confirm | Row disappears; total drops; row still in DB (voided) |
| 3.2 | Void debt payment | Payments view → tap a row → confirm | Row disappears; net debt rises back up |
| 3.3 | Months/sales not voidable here | Tap a Months or Sales row | No void prompt (void the underlying payment/sale in its own tab) |
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
