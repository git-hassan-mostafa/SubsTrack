# Collector Wallet — QA Test Plan

Cash each user collects but has not yet handed over to an admin. Runtime-computed (never a stored balance) from the three cash sources; the only stored state is `remitted_at`/`remitted_by` on `payments`, `sales`, `debt_payments`.

## Reference code

- Service: `SubsTrack/src/modules/wallet/services/WalletService.ts`
- Slice: `SubsTrack/src/state/slices/wallet/walletSlice.ts`
- Screens: `SubsTrack/src/modules/wallet/screens/WalletsScreen.tsx` (admin), `MyWalletScreen.tsx` (self)
- Detail body: `SubsTrack/src/modules/wallet/components/WalletDetailView.tsx`
- Cash reads: `PaymentService.getUnremittedForWallet`, `SaleService.getUnremittedForWallet`, `DebtService.getUnremittedDebtPayments`

---

## 1. Wallet accrual

1.1 As a collector, record a subscription payment (full) → open **Settings → My Wallet** → the payment appears; total equals its amount.
1.2 Record a **partial** payment → wallet shows the collected `amount_paid`, not the full due.
1.3 Record a sale paid in full → appears in the wallet at `amount_paid`.
1.4 Record a **partial** sale → wallet shows only the collected part (not `total_amount`); the unpaid remainder shows in Debts, not the wallet.
1.5 Record a debt payment → appears in the wallet.
1.6 Add a **custom debt** → does NOT appear in any wallet (it is money owed to the business, not collected cash).
1.7 A payment with no `received_by_user_id` (unattributed) never appears in a wallet.

## 2. Admin view & receiving

2.1 **Admin → Wallets** lists every collector holding cash, most-cash-first, with a per-collector USD total and a grand total header.
2.2 Tap a collector → detail shows per-currency breakdown (when >1 currency) + the list of transactions.
2.3 Tap **Receive** on one transaction → confirm → it disappears from the wallet; the collector total and grand total drop by that amount.
2.4 Tap **Receive all** → confirm → the collector's wallet empties; they drop off the list (or show 0).
2.5 A **non-admin** user cannot reach Admin → Wallets (admin tab hidden) and has no receive actions in My Wallet.
2.6 After receiving, the collector's **My Wallet** self-view no longer shows the received transactions.

## 2b. Detail list — cards, filters & multi-select

2b.1 Each transaction card shows the **customer** as its main line; a sale with no customer shows "Walk-in".
2b.2 The secondary line reads `type · descriptor · date` (e.g. "Subscription · Basic · Jul 15, 2026", "Sale · Widget · Jul 14, 2026", "Debt payment · Jul 13, 2026"); the date uses the app's standard format.
2b.3 Open **filters** → filter by **customer**: only that customer's transactions remain; the headline total does NOT change (it stays the full wallet).
2b.4 Filter by **type** (subscription / sale / debt payment) → only that source remains.
2b.5 Set a **from/to date range** → only transactions in range remain; clearing a bound widens it again.
2b.6 "Clear filters" resets all filters; the filter dot on the toggle reflects whether any filter is active.
2b.7 With filters yielding no rows, the list shows "No matching transactions" (not the empty-wallet message).
2b.8 **Long-press** a transaction → selection mode; the icon becomes a checkbox and the filter row is replaced by the selection bar.
2b.9 Select several → tap **Receive** in the selection bar → confirm → all selected are handed over and drop from the wallet; selection clears.
2b.10 "Select all" in the selection bar selects every **currently filtered** row (filter a customer first, then select-all → only their rows).
2b.11 In the read-only **My Wallet** self-view, filters work but there are no checkboxes, no per-item Receive, and no selection bar.
2b.12 Switching to a different collector resets filters and selection; receiving within one collector keeps them.

## 3. Multi-currency

3.1 A collector holding cash in two currencies (e.g. USD + LBP) shows both in the per-currency breakdown, each as the raw physical amount in that currency.
3.2 The headline total is the USD sum (via each row's snapshot rate), formatted into the display currency.
3.3 "Receive all" clears every currency at once.

## 4. Self-correction & edge cases

4.1 **Void** a payment that is in a wallet → it disappears from the wallet on next refresh.
4.2 **Void after handover**: receive a payment, then void it → the collector's total goes negative (business owes the collector); the negative shows correctly.
4.3 **Void + re-pay** a month that was previously received → the re-paid cash appears as **unremitted** again (fresh) in the collector's wallet.
4.4 **Edit** an already-received payment's amount → the current wallet is unaffected (only unremitted rows count).
4.5 A **deactivated** collector who still holds cash still appears in the admin Wallets list (dimmed).

## 5. Branch scoping

5.1 A branch-scoped admin sees only wallets for collectors/cash in their branch.
5.2 A tenant-wide admin can switch branches via the header selector and the wallet list re-scopes.

## 6. Offline (native)

6.1 Record cash offline → it appears in My Wallet immediately (local mirror).
6.2 Receive a transaction offline → it leaves the wallet locally and syncs the `remitted_at`/`remitted_by` on next sync.
6.3 Two devices: device A receives all from a collector while device B records new cash → after sync, the collector's wallet holds only device B's new (unremitted) cash.

## 7. Historical data

7.1 On first launch after the feature ships, existing collected transactions all appear as unremitted in their collectors' wallets (no cutoff).
7.2 A one-time "Receive all" per collector clears the historical backlog.
