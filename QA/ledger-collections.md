# The Ledger (charges + collections) — QA Scenarios

Covers the money model that replaced `payments` / `custom_debts` / `debt_payments`: raising a bill, collecting against it (in one go, in installments, or across several bills at once via the oldest-first waterfall), voiding a hand-over, and writing a bill off. **Run this file before `debts.md`, `payments.md`, `monthly-grid.md`, `sales.md`, `wallet.md`, `dashboard.md` and `reports.md`** — every one of those reads these three tables.

**Reference code:**
- Services: [ChargeService.ts](../SubsTrack/src/modules/ledger/services/ChargeService.ts), [CollectionService.ts](../SubsTrack/src/modules/ledger/services/CollectionService.ts), [LedgerService.ts](../SubsTrack/src/modules/ledger/services/LedgerService.ts)
- The allocation algorithm: [waterfall.ts](../SubsTrack/src/modules/ledger/utils/waterfall.ts) · the debt rule + item builders: [openItems.ts](../SubsTrack/src/modules/ledger/utils/openItems.ts)
- Repositories: `ChargeRepository(.offline)`, `CollectionRepository(.offline)`
- Sheets: [CollectSheet.tsx](../SubsTrack/src/modules/ledger/components/CollectSheet.tsx), [BillSheet.tsx](../SubsTrack/src/modules/ledger/components/BillSheet.tsx), [CollectQuickActionSheet.tsx](../SubsTrack/src/modules/ledger/components/CollectQuickActionSheet.tsx)
- History: [CollectionsPanel.tsx](../SubsTrack/src/modules/ledger/screens/CollectionsPanel.tsx) · card: [CollectionCard.tsx](../SubsTrack/src/modules/ledger/components/CollectionCard.tsx)
- Slices: `ledger` (`ledgerSlice.ts`), `collections` (`collectionsListSlice.ts`)
- Schema: `charges`, `collections`, `collection_items`, and the `charge_balances` view in `sql scripts/script.sql`

---

## 0. Critical invariants

1. **A balance is never stored.** `balance = charge.amount − Σ collection_items (of non-voided collections)`. There is no `paid` column anywhere. Verify by querying `charge_balances` directly after each scenario.
2. **Everything keys off MONEY, not off a row existing.** A bill left at 0 collected must read *identically* to a month that was never touched: `unpaid` in the grid, absent from Debts, not "covered" for the pay-order gate.
3. **A fully unpaid month is OWED but is NOT a debt.** It belongs to the month grid. Only a **partly paid** month appears on the Debts screen.
4. **One currency per hand-over**, equal to the currency of every bill it pays.
5. **Overpay is refused**, at the service and in the sheet.
6. **Void ≠ write-off.** A void says the bill never existed (refused once money sits on it); a write-off says it is real but lost. The DB enforces they are mutually exclusive.
7. **Correcting money is a void, never an edit.** There is no "change the amount" anywhere on a hand-over.

---

## 1. Collecting one month

1.1 Open a customer with an unpaid January. Tap the January cell → the collect sheet opens with the month as its single item and the amount pre-filled to the full price.
1.2 Save. The cell turns green (`Paid`), and the year's "collected" chip rises by the amount.
1.3 In the DB: exactly **one** `charges` row (kind `month`, `duration_months` 1), **one** `collections` row, **one** `collection_items` row, and `charge_balances.balance = 0`.
1.4 The `charges.id` equals `deterministicId(customer_plan_id, billing_month)` — see 9.2 for why this matters.
1.5 The `collections.received_at` is today, and the money appears in **this month's** dashboard revenue even though the billing month is January.

## 2. Installments on one bill (the core case)

2.1 A month priced 20. Open the cell menu → **Collect part** → type **10** → save.
2.2 The cell shows the paid fill under an **amber ring** with the sublabel `PARTIAL`.
2.3 The Debts screen now lists this customer with a `months` row of **10**, showing `10/20 $` on its date line.
2.4 Collect **5** more (from the cell menu's "Collect the rest", typing 5). Debt drops to 5; the cell is still `PARTIAL`.
2.5 Collect the final **5**. The ring disappears, the sublabel reads `Paid`, and the customer leaves the Debts list.
2.6 Open the cell → **View bill**. The hero reads the full amount, and the body lists **three** payments, each with its own date and collector. This is the scenario the whole rewrite exists for — verify all three are there.
2.7 Each of the three shows in the money-in history as its own row, on its own date.

## 3. The waterfall (the worked example)

Set up ONE customer owing exactly this:

| What | Amount | Due |
| --- | --- | --- |
| January (unpaid month) | 20 | Jan |
| February (unpaid month) | 20 | Feb |
| A pay-later sale | 40 | 5 Mar |
| A hand-typed fee | 20 | 10 Mar |

3.1 Customer list → the card's 3-dot → **Collect money**. The sheet opens with **Owed 100** and all four rows listed.
3.2 Type **55**. The preview updates live: January **pays in full**, February **pays in full**, the sale shows **15** and *"leaves 25 owing"*, the fee shows **—** / *"not covered"*.
3.3 "Still owed after" reads **45**.
3.4 Save. **One** `collections` row of 55, with **three** `collection_items` (20 / 20 / 15).
3.5 January and February cells both turn green. The two month bills were **materialized by this write** — they did not exist before it.
3.6 The Debts screen shows the sale at **25** and the fee at **20**; the two months are gone.
3.7 The money-in history shows **one** row of 55 with a `3 items ▾` expander; expanding it lists the split.
3.8 The audit log has **one** `collections` create entry whose `after_data` carries the whole split, plus a `charges` create for each month it raised.
3.9 Send the WhatsApp receipt from that row: **one** message, listing the three lines under "This pays".

## 4. Steering the money

4.1 Repeat the 3.x setup. Open the collect sheet, type 55, then **untick February**.
4.2 The preview re-splits: January 20, the sale 35, the fee untouched. February shows "not covered".
4.3 Save and confirm the DB matches the preview exactly — the preview and the write must never disagree.

## 5. Overpay is refused

5.1 With 100 owed, type **150**. An error banner appears naming the maximum (100) and **Save is disabled**.
5.2 Tap the banner's dismiss → the amount snaps back to 100.
5.3 Attempt it through a single bill too: on a bill owing 20, type 25 → refused.

## 6. Void a hand-over

6.1 After scenario 3, open the January cell → **View bill** → the payment row's 3-dot → **Void payment**.
6.2 The dialog warns that this payment settled **3 bills** and voiding it makes all of them owed again. Confirm.
6.3 January and February cells go back to **red / unpaid** — *not* to "partial", and *not* to any new state. The empty bills are still in the DB (`charges` rows exist with 0 collected).
6.4 The Debts screen does **not** list those two months (an empty month bill is not a debt).
6.5 The sale goes back to owing 40, the fee to 20.
6.6 The money-in history still shows the 55, dimmed, marked **Voided**; the month-section total drops by 55.
6.7 The dashboard's revenue for the month drops by 55; the collector's wallet drops by 55.
6.8 Re-collect January: it uses the **same bill** (same id, same frozen price) rather than raising a second one.

## 7. Write-off

7.1 On the Debts screen, open a debtor → a bill's 3-dot → **Write off**. The caption reads "He will not pay — record it as a loss".
7.2 Confirm. The bill leaves the Debts list and stops counting toward "still owed".
7.3 Reports → Debts shows it under **Written off** for the period it was written off in.
7.4 Only the part **never collected** is counted as the loss — write off a bill of 50 that had 20 collected and the loss is 30.
7.5 A written-off bill cannot also be voided (and vice versa) — the DB constraint refuses it.
7.6 A bill with money on it **cannot be voided**: the error tells you to void the payment first or write it off.

## 8. Two currencies

8.1 Give one customer an LBP month and a USD month, both unpaid.
8.2 Open **Collect money**. A **currency picker** appears; the pool shows only the bills in the selected currency.
8.3 Collect the USD one. Switch the picker to LBP — the amount resets and the LBP bill is listed.
8.4 Collect that too. **Two** `collections` rows, each single-currency, each closing its bill at exactly **0** (no rounding residue).
8.5 "Collect all due" from the customer card does the same automatically: two hand-overs, two receipts.

## 8b. A line with no set price (typed amount)

Set-up: a customer whose only service line is **"No plan"** (or a plan marked
*custom price*), so `resolveLinePrice` returns `kind: 'typed'`.

8b.1 Tap the current month's cell. The collect sheet opens — **not** a "no set price" dead-end popup.
8b.2 It shows a hint, then **Amount for this month**, then **Amount**. The currency picker on the first field is *unlocked*; the second follows it.
8b.3 Type `50` in the month amount. The collected amount auto-fills to `50`. Save → one `charges` row of 50 and one `collections` row of 50; the cell turns green.
8b.4 Repeat on another month, but lower the collected amount to `20`. Save → the bill is **50**, the hand-over **20**, the cell is green with the amber **PARTIAL** ring, and the bill sheet reads `20/50`.
8b.5 That remaining 30 now appears on the **Debts** screen and in the waterfall — from this point the line behaves like any priced one.
8b.6 Type a collected amount **above** the month amount → the overpay banner appears and Save is disabled.
8b.7 Pick **LBP** on the month-amount field. The bill and the hand-over are both written in LBP with the live LBP rate frozen on each.
8b.8 **Quick pay** from the customer card (a customer whose only collectable line is price-less) opens this same sheet **on the list**, without navigating — there is nothing to charge automatically, so it asks. Two such lines navigate to the detail page instead, where each month is collected on its own.
8b.9 Multi-select **two** months on that line and collect → refused with "each month needs its own amount", because two unknown figures cannot share one field.
8b.10 The **Collect money** quick action for a customer whose only line is price-less says "owes nothing" — correct: nothing is owed until an amount is typed, and the month grid is where it is typed.

## 9. Offline

9.1 Airplane mode. Collect a month, partly collect another, void one. All succeed locally and the grid updates.
9.2 **Two devices, same month, both offline.** Device A collects January 20; device B collects January 20. Reconnect both. Result: **ONE** `charges` row for January (the deterministic id) and **TWO** `collections` rows. The month is billed once and credited twice — the balance is −20, which is the true story and is visible on the bill sheet.
9.3 Sync order: `collections` (wave 3) → `charges` (wave 4) → `collection_items` (wave 5). Confirm no 23503 foreign-key error in the sync log.
9.4 A collection and the bills it materialized commit **together** offline: kill the app mid-save and confirm you never see a `collection_items` row pointing at a missing charge.
9.5 With the mirror rebuilt from scratch, the offline balance for every bill equals the server's `charge_balances`.

## 10. Branch scoping

10.1 As a branch admin, the Debts screen, the money-in history and Reports show only that branch's bills and cash.
10.2 A **walk-in sale's** cash (no customer) still appears in its branch's figures — this is the case the naive join drops (gotcha #103).
10.3 Switch the header branch chip and confirm every figure moves together; the sum of all branches equals the all-branches view.

## 11. Audit

11.1 Every `collections` create, void; every `charges` create, update, void, write-off — all present in Admin → Audit Log.
11.2 A collection's entry carries its split in `after_data`.
11.3 `collection_items` has **no** entries of its own (deliberate).
11.4 The customer's History sheet shows their bills and hand-overs alongside the profile and service-line changes.

## 12. Things that must NOT be possible

12.1 No screen offers to edit the amount of a recorded hand-over.
12.2 No screen offers "void this month's payment" on a month cell — only **View bill**.
12.3 No "Complete" action anywhere (on a debt row or a sale row).
12.4 A partly-paid month never shows a "partial" *status* — it is `paid` everywhere the status is read, and only the ring / fraction distinguish it.
12.5 Collecting a month while an **earlier** month of the same line is uncovered is refused, naming the older month.

## 13. Offline: the bill's two unique keys (gotcha #114)

Native build only — the web repository tolerates the duplicate id silently, so these must be run on a device.

13.1 On a **multi-month plan** (e.g. $100 / 3 months), collect a block (Aug–Oct), then collect the **next** block (Nov). It must save. Previously this died with `UNIQUE constraint failed: charges.id` and the whole collect rolled back.
13.2 Make a month's deterministic id belong to an unrelated row: collect a month, then change that service line's **start date** (or move the line) so the block start shifts, then collect the newly-exposed month. The save must succeed and the new bill must get a **fresh** id rather than colliding.
13.3 After 13.1/13.2, open the month's **View bill** and confirm the hand-over is listed against it — the `collection_items` must point at the bill that really exists, not at the id the waterfall intended.
13.4 Admin → Audit Log shows the `charges` create entry under the id that was **actually stored** (the same id the bill sheet shows).
13.5 Collect a **walk-in sale** (no customer, so `customer_plan_id` is NULL) and confirm the bill and its cash still save — the natural-key lookup matches nothing for these and must fall through to the id check.
13.6 Sync after each of the above and confirm the bill converges to ONE row on the server (no duplicate month bill for the same line + month).
