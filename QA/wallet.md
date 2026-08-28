# Collector Wallet — QA Test Plan

The cash each user is **physically holding right now**. Runtime-computed (never a stored balance) from the one cash source; the only stored state is `held_by_user_id` + `remitted_at` / `remitted_by` on `payments`, `sales`, `collections`.

Receiving moves cash **up a chain** and never destroys it:

```
collector (user)  →  branch admin  →  tenant-wide admin  →  owner (superadmin)
   rank 0              rank 1             rank 2                 rank 3
```

> **Run `sql scripts/script.sql` first.** It adds `held_by_user_id` and backfills it.

## Reference code

- Rules: `SubsTrack/src/modules/wallet/utils/custody.ts` (`walletRank` / `receiveBlock` / `canCloseOut` / `custodyTargetFor`)
- Service: `SubsTrack/src/modules/wallet/services/WalletService.ts`
- Slice: `SubsTrack/src/state/slices/wallet/walletSlice.ts`
- Screens: `SubsTrack/src/modules/wallet/screens/WalletsScreen.tsx` (admin), `MyWalletScreen.tsx` (self)
- Detail body: `SubsTrack/src/modules/wallet/components/WalletDetailView.tsx`
- Cash reads: `PaymentService.getHeldForWallet`, `SaleService.getHeldForWallet`, `DebtService.getHeldDebtPayments`

**Test accounts needed:** one collector per branch (Ali in A, Nour in B), a branch admin per branch (Sara in A, Rami in B), two tenant-wide admins (Omar, Dina), the owner, and one collector with **no branch**.

---

## 0. Critical invariants

1. **Nobody can receive their own cash.** Not a collector, not a branch admin, not a tenant-wide admin, not the owner. This is the bug that started the change.
2. **Receiving never destroys money.** The grand total on Admin → Wallets is unchanged by a handover — the cash just sits under a different name.
3. **Only two doors remove cash from the system:** the owner receiving it, and a tenant-wide admin closing out their own wallet.
4. **A peer can never take from a peer.** Two branch admins, or two tenant-wide admins, are blocked from each other.
5. **A branch admin's reach stops at their branch.**

---

## 1. Wallet accrual

1.1 As a collector, record a subscription payment (full) → **Settings → My Wallet** → the payment appears; total equals its amount.
1.2 Collect **part** of a month → the wallet shows what was handed over, not what was billed.
1.3 Record a sale paid in full → its hand-over appears at the collected amount.
1.4 Record a **partial** sale → only the collected part (not `total_amount`); the remainder shows in Debts, not the wallet.
1.5 Record a debt payment → appears in the wallet.
1.6 Add a **custom debt** → does NOT appear in any wallet (money owed to the business, not collected cash).
1.7 A payment with no `received_by_user_id` (unattributed) never appears in a wallet.

## 2. The chain — receiving moves cash, it doesn't delete it

2.1 Ali (collector, branch A) collects 3 payments. Sara (branch admin, A) opens **Admin → Wallets** → Ali's wallet is listed and receivable.
2.2 Sara taps **Receive all** on Ali → Ali's wallet is empty; **Sara's own wallet now holds those 3**, and the screen's grand total is **unchanged**.
2.3 Sara opens her own wallet (**Settings → My Wallet**) → the 3 rows are there, each with "**Collected by Ali**" on the second line.
2.4 Omar (tenant-wide admin) opens Admin → Wallets → Sara's wallet is listed with those 3; he receives them → they move to **Omar's** wallet, still showing "Collected by Ali".
2.5 Per-transaction: Sara receives **one** of Ali's rows → only that row moves; the rest stay with Ali.
2.6 Multi-select: long-press two of Ali's rows → **Receive** in the selection bar → both move; selection clears.
2.7 On an **untouched** wallet (a collector's own cash), no "Collected by" line appears — the holder is the collector.

## 3. Who may receive from whom

For each row, open Admin → Wallets as the viewer and check both the row's 3-dot menu and the detail sheet.

| #   | Viewer | Holder | Expected |
| --- | --- | --- | --- |
| 3.1 | Branch admin Sara (A) | **herself** | "You" chip on the card; no Receive; menu says **"You cannot receive your own cash"** |
| 3.2 | Branch admin Sara (A) | Collector Ali (A) | Receive allowed |
| 3.3 | Branch admin Sara (A) | Collector Nour (**B**) | Not receivable — **"They are not in your branch"** (if visible at all; RLS may hide her) |
| 3.4 | Branch admin Sara (A) | Branch admin Rami (B) | Not receivable — branch/rank block |
| 3.5 | Branch admin Sara (A) | Collector with **no branch** | Not receivable — **"They are not in your branch"** |
| 3.6 | Branch admin Sara (A) | Tenant-wide admin Omar | Not receivable — **"Only someone above them can receive this cash"** |
| 3.7 | Tenant-wide admin Omar | **himself** | "You" chip; no Receive; **Close out all** offered instead |
| 3.8 | Tenant-wide admin Omar | Branch admin Sara | Receive allowed |
| 3.9 | Tenant-wide admin Omar | Collector Ali (any branch) | Receive allowed — he may skip the branch admin |
| 3.10 | Tenant-wide admin Omar | Collector with no branch | Receive allowed |
| 3.11 | Tenant-wide admin Omar | Tenant-wide admin **Dina** | Not receivable — peers, rank block |
| 3.12 | Owner (superadmin) | anyone | Receive allowed |
| 3.13 | Collector Ali | anyone | Admin → Wallets is unreachable (admin tab hidden); My Wallet shows **no** actions at all |

## 4. Leaving the system

4.1 **Owner receives** from Omar → the cash disappears from **every** wallet; the Admin → Wallets grand total drops; the owner's own My Wallet does **not** grow.
4.2 **Close out (own wallet), tenant-wide admin:** Omar → My Wallet → **Close out all** → confirm → his wallet empties and the dashboard cash tile drops by that amount.
4.3 Close out **selected** rows only (long-press multi-select in My Wallet) → only those leave.
4.4 A **branch admin** has no Close out anywhere (rank 1) — their My Wallet is read-only; their cash leaves only when someone above receives it.
4.5 A **collector** likewise has no Close out.
4.6 After 4.1 or 4.2, **Admin → Audit Log** shows an **Edited** entry per payment/sale with `Held by  <name> → (empty)`, plus `Settled at` and `Settled by`.
4.7 A plain handover (2.2) logs `Held by  Ali → Sara` with **no** `Settled at` — it did not leave the system.

## 5. Multi-currency

5.1 A holder carrying two currencies (e.g. USD + LBP) shows both in the per-currency breakdown, each as the raw physical amount.
5.2 The headline total is the USD sum (via each row's snapshot rate), formatted into the display currency.
5.3 "Receive all" moves every currency at once, and the receiver's breakdown shows both.

## 6. Detail list — cards, filters & multi-select

6.1 Each card shows the **customer** as its main line; a sale with no customer shows "Walk-in".
6.2 The secondary line reads `type · descriptor · date` (+ `· Collected by <name>` once the cash has moved).
6.3 **Filters** by customer / type / from–to date narrow only the list — the headline total stays the full wallet.
6.4 "Clear filters" resets all; the filter dot reflects whether any filter is active.
6.5 Filters yielding nothing show "No matching transactions" (not the empty-wallet message).
6.6 "Select all" in the selection bar selects every **currently filtered** row.
6.7 Switching to a different holder resets filters and selection; acting within one holder keeps them.
6.8 In a `view`-mode wallet (someone you can't act on, or your own when you can't close out) there are **no** checkboxes, no per-item action and no selection bar — filters still work.

## 7. Self-correction & edge cases

7.1 **Void** a payment sitting in a wallet → it disappears from that wallet on next refresh, wherever in the chain it had reached.
7.2 **Void after a handover:** Sara receives a payment, then it is voided → Sara's total drops by it (and can go negative if she had already passed cash on — the business owes her; shown as a negative figure).
7.3 **Void + re-pay** a month whose cash had travelled up the chain → the re-recorded cash is **back with its collector**, not with the old holder.
7.4 **Edit** an already-settled payment's amount → no current wallet changes.
7.5 A **deactivated** holder who still has cash still appears in Admin → Wallets (dimmed) and is still receivable.
7.6 Deleting a staff member who **holds** cash but recorded none → they are **deactivated**, not hard-deleted (their wallet must not vanish).
7.7 A holder the viewer cannot see (a branch admin looking at a tenant-wide admin's holdings) is **absent from the list** rather than shown as "Unknown".

## 8. Dashboard

8.1 The admin **Cash on hand** tile equals the sum of every wallet in the current branch scope, the viewer's own included.
8.2 A handover (2.2) does **not** change the tile — only 4.1 / 4.2 reduce it.
8.3 A non-admin's dashboard neither shows nor computes the tile.

## 9. Branch scoping

9.1 A branch-scoped admin sees only wallets holding cash from their branch.
9.2 A tenant-wide admin switches branches via the header chip and the list re-scopes.
9.3 With the chip on "All branches", a tenant-wide admin sees every wallet.

## 10. Offline (native)

10.1 Record cash offline → it appears in My Wallet immediately (local mirror).
10.2 Receive offline → the cash moves locally and syncs on the next connection.
10.3 Close out offline → same.
10.4 **Two admins, same rows:** Omar and Dina both receive the same rows from Sara while offline → after sync the rows sit with **exactly one** of them (the guarded UPDATE makes the second a no-op), never split or duplicated.
10.5 Device A receives all from a collector while device B records new cash → after sync the collector's wallet holds only device B's new cash.

## 11. Migration (existing data)

11.1 After running `script.sql` on a live DB: cash that had **never** been handed over is in its **collector's** wallet, exactly as before.
11.2 Cash that had already been remitted is in **nobody's** wallet — it does not appear under the admin who once received it.
11.3 Re-run `script.sql` → nothing moves (the backfill is idempotent).
11.4 On a native device after the update: the backfilled rows arrive on the next pull. A device holding un-pushed cash from before the update should **sync first, then** get the update (or clear its local DB and re-sync) — nothing backfills the mirror locally.
