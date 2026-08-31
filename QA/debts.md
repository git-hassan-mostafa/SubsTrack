# Debts — QA Scenarios

Covers the **Debts** screen (Transactions → Debts — a single debtors list, no sub-tabs): who owes money, how far behind they are, and the two corrections a bill can take. The money model underneath is in [ledger-collections.md](ledger-collections.md) — **run that file first**; this one covers only the screen.

**Reference code:**
- Panel: [DebtsPanel.tsx](../SubsTrack/src/modules/transaction/debts/screens/DebtsPanel.tsx)
- Cards: [DebtorCard.tsx](../SubsTrack/src/modules/transaction/debts/components/DebtorCard.tsx), [DebtItemCard.tsx](../SubsTrack/src/modules/transaction/debts/components/DebtItemCard.tsx)
- Shared list: [DebtList.tsx](../SubsTrack/src/modules/transaction/debts/components/DebtList.tsx) (debtor sheet + customer-detail panel), debtor sheet: [DebtorDetailSheet.tsx](../SubsTrack/src/modules/transaction/debts/components/DebtorDetailSheet.tsx)
- Form: [CustomDebtFormSheet.tsx](../SubsTrack/src/modules/transaction/debts/components/CustomDebtFormSheet.tsx) (writes a `manual` charge)
- Row actions: [useDebtRowActions.ts](../SubsTrack/src/modules/transaction/debts/hooks/useDebtRowActions.ts) (void / write off)
- Collecting: [useCollectSheet.tsx](../SubsTrack/src/modules/ledger/hooks/useCollectSheet.tsx) + `CollectSheet`
- Service: [ChargeService.buildDebtsView](../SubsTrack/src/modules/ledger/services/ChargeService.ts), [LedgerService.getDebtsView](../SubsTrack/src/modules/ledger/services/LedgerService.ts)
- Slice: [ledgerSlice.ts](../SubsTrack/src/state/slices/ledger/ledgerSlice.ts)

---

## 0. Critical invariants

1. **Every figure comes from ONE query over `charges`** joined to what has been collected. No category merging, no `gross − payments` subtraction.
2. **The parts ADD UP.** `monthsDebt + salesDebt + manualDebt = totalDebt`, exactly. If they don't, something is reading the wrong source.
3. **A fully unpaid month is OWED but is NOT a debt** — it belongs to the month grid, and this screen never lists one. It reads STORED bills only, and a month has no bill until money reaches it, so a never-touched month is invisible here by construction. The **"+N unpaid months"** hint and the sheet's **Unpaid months** section therefore fill only from **partly-paid** months of a customer who already has a real debt.
3b. **An EMPTY month bill must read exactly like a month never touched.** Paying a month and then voiding that payment leaves a `charges` row with `paid = 0`; it is skipped here, because otherwise voiding a payment would be the ONE way a plain unpaid month reached this screen — showing that single month while every other unpaid month of the same customer stayed hidden. Key off MONEY, never off a row existing (gotcha #106).
4. **A debt row is:** a partly-paid month, an open or partly-paid sale, or a hand-typed fee.
5. **Kinds:** `month` / `sale` / `manual`. A sale made of **service** lines files under `sale` — the debt belongs to the sale as a whole.
6. **Currency:** every bill freezes `rate_per_usd_snapshot` when it is raised. Totals are summed in USD via each row's own snapshot, then formatted into the display currency — they never drift when the live rate changes.
7. **No hard delete.** A bill is voided (a mistake) or written off (a loss); either way the row stays.
8. **Branch scoping is the bill's own `branch_id`** (gotcha #103), always stamped from the customer.
9. **No tier gating** — raising and collecting bills is unlimited.

---

## 1. The debtors list

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Open the screen | Transactions → Debts | Total outstanding on top, with "owed by N customers" under it; then a name search; then one row per debtor |
| 1.2 | Empty state | Tenant with no debts | "No debtors" empty state; the FAB (add custom debt) is still visible |
| 1.3 | **Sorted by how far behind** | Several debtors with different oldest due dates | Worst-behind first, then by amount — not alphabetical, not by amount alone |
| 1.4 | Days behind | A debtor whose oldest bill is 12 days past due | Card sub-line reads "12 days behind" |
| 1.5 | Not late yet | A debtor whose only bill is not yet due | Sub-line reads "Not late yet" |
| 1.6 | Unpaid-months hint | A debtor who also has 2 **partly-paid** months | Sub-line ends with a muted "+2 unpaid months · $40" — and that amount is **not** in the bold debt figure |
| 1.7 | A partly-paid month appears | Collect 10 of a 20 month | The customer appears; their debt rises by 10 |
| 1.8 | A pay-later sale appears | Record a sale with **No payment** | The customer's debt rises by the whole total, dated from `sold_at` |
| 1.9 | A fully paid sale does not | Record a sale as **Full** | No debt for it |
| 1.10 | A hand-typed fee appears | FAB → Add custom debt | Debt rises by the amount |
| 1.11 | Search | Type part of a name | Client-side filter, no spinner and no re-fetch |
| 1.12 | Totals reconcile | Note the header; add a fee of X | The header rises by exactly X (converted to the display currency) |
| 1.13 | **A fully unpaid month never becomes a row** | A customer with nothing collected all year | They do NOT appear in the list at all (the grid is where that lives) |
| 1.14 | **Paying a month then voiding the payment leaves NOTHING here** | Collect a month in full → void that payment → open Debts | The month is gone from this screen entirely: it is back to a plain unpaid month, which lives in the grid. The customer disappears too unless they hold a real debt. **This was the bug** — the emptied bill used to appear as a lone "unpaid month" while the same customer's genuinely unpaid months stayed hidden |
| 1.15 | The voided month is still owed | After 1.14, open the customer's month grid | The cell is **red / unpaid** and collectable again — voiding the cash never made the month go away, it only moved it back to the grid's workflow |
| 1.16 | Partial then void | Collect 10 of 20, then void that payment | Same as 1.14 — `paid` is back to 0, so the row stops being a debt and leaves the screen |
| 1.17 | A partial that survives stays a debt | Collect 10 of 20 and leave it | The month IS a debt row (§1.7) — only a fully emptied bill is skipped |

---

## 2. The debtor sheet

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Open | Tap a debtor row | A full-height sheet: name, total outstanding, then a **Collect** button, then the debts, then a muted **Unpaid months** section — the latter present only when a **partly-paid** month exists |
| 2.1b | No emptied bills in the section | Pay a month, void the payment, open the debtor sheet | The **Unpaid months** section does not list that month (and is absent altogether if it was the only entry) |
| 2.2 | The two sections are different things | Compare | The bold total on the card counts only the debts; the sheet's button covers **both** sections, which is why its figure can be larger |
| 2.3 | Collect everything | Tap **Collect $N** | The collect sheet opens with the whole pool and the waterfall preview (see ledger-collections.md §3) |
| 2.4 | Collect one bill | A row's 3-dot → **Collect** | The collect sheet opens with that bill alone, no split preview |
| 2.5 | Live refresh | Collect part of a bill from inside the sheet | The row's amount drops and the header follows, without closing the sheet |
| 2.6 | Add a fee here | Header **+** → amount, description, due date → save | Pre-filled to this customer (read-only); the row appears and the total rises |
| 2.7 | Rows show the fraction | A month with 10 of 20 collected | The date line reads "… · 10/20 $" — collected out of owed, in the collected currency |
| 2.8 | Rows show how late | A bill 40 days past due | The date line includes "40 days late" |
| 2.9 | Settled customer | Collect everything | The sheet empties and the customer leaves the list |
| 2.10 | **Newest first — the sheet only** | A customer owing Jan, Mar and a sale raised today | The sheet lists them **latest raised first** (sale, Mar, Jan). Both sections sort this way independently. The Debts **list** and the customer-detail panel are unchanged — still oldest due date first |
| 2.11 | The display sort never moves the money | With that list on screen, tap **Collect $N** | The split preview still fills **oldest due date first** (Jan, then Mar, then the sale) — the list's order is presentation only |
| 2.12 | Rows show the time | A bill raised today | The date line ends with when it was billed, clock time included ("Billed on" instant, e.g. "Aug 31, 2:15 PM"); the year is dropped while it is the current one |
| 2.13 | A virtual month shows no time | An unpaid month nothing has been collected for | **No** time is printed — it has no bill yet, so there is no real instant to show. Only its due date and "days late" |

---

## 3. Correcting a bill (the two doors)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | **Write off** is offered on any real bill | A row's 3-dot | "Write off" with the caption "He will not pay — record it as a loss" |
| 3.2 | Write off | Confirm the dialog (which names the amount and the customer) | The row leaves the list; the total drops; Reports → Debts counts it under **Written off** |
| 3.3 | Only the uncollected part is the loss | Write off a 50 bill that had 20 collected | Reports shows 30, not 50 |
| 3.4 | **Remove** only on a hand-typed fee | Compare a `manual` row with a `month` / `sale` row | "Remove" appears only on the fee. A month is undone by voiding its payment; a sale by voiding the sale |
| 3.5 | Remove a fee | Confirm | Voided; it leaves the list; the row stays in the DB |
| 3.6 | A bill with money cannot be removed | Try to remove a fee that has been partly collected | Refused, telling you to void the payment first or write it off |
| 3.7 | Void and write-off are exclusive | Try both on one bill | The second is refused (DB constraint) |
| 3.8 | **There is no "Complete"** | Check every menu | The action is gone — collecting the rest is the real action, and it is one tap away |

---

## 4. The customer-detail panel

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Where | Customer detail → below the sales panel | A "Transactions" section listing this customer's open bills with the total |
| 4.2 | Not branch-scoped | As a branch admin, open a customer of another branch (if reachable) | All of that customer's bills show, regardless of the header chip — same rule as the sales panel |
| 4.3 | **Unpaid months are NOT listed here** | A customer with unpaid months | Only debts appear — the month grid is right above, so listing them twice is noise |
| 4.4 | Same actions | A row's 3-dot | Collect / Write off / (Remove on a fee) — the same set as the Debts screen |
| 4.5 | Refresh on focus | Raise a bill elsewhere, come back | The panel re-reads and shows it |
| 4.6 | Add a fee | Header **+** | Pre-scoped to this customer; the panel refreshes on save |

---

## 5. Adding a hand-typed fee

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Required fields | Leave the customer, the amount **or the description** empty | Submit stays disabled — a fee with no description is a row that says nothing |
| 5.2 | Due date | Default is today; change it to last month | The bill sorts **ahead** of newer ones in the waterfall, and its "days late" counts from that date |
| 5.3 | Back-dating is deliberate | Set the due date to 2020 | It jumps to the front of the queue. This is the intended meaning of back-dating (see gotcha #74's reasoning) |
| 5.4 | Currency | Record in LBP, then change the tenant LBP rate | The bill's contribution to the USD total does NOT change |
| 5.5 | Branch | Recorded for a branch customer | The bill carries that customer's branch |
| 5.6 | Quick action | PageHeader 3-dot → Add custom debt | Opens standalone with its own customer picker |

---

## 6. Branch + offline

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Branch scope | As a branch admin | Only that branch's debtors; the sum of all branches equals the all-branches view |
| 6.2 | Offline read | Airplane mode | The list renders from the mirror with the same totals |
| 6.3 | Offline write | Add a fee, write one off, offline | Both apply locally; both sync on reconnect |
| 6.4 | Customer-list badge | The "Has debts" tab and the card's debt pill | Both ask `hasDebtFlag(netUsd)` over `ledger.netByCustomer`, so they always agree; unlike the month tabs it is **not** restricted to active + regular |
