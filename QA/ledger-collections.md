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
3.7 The money-in history shows **one** row of 55: the two months and the sale are named on its second line, with a grey `3 items` chip; tapping the row opens the split.
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
7.6 A **debt row's** void still refuses a bill with money on it (it only ever removes a hand-typed fee): the error tells you to void the payment first or write it off. The wide door is section 6b, and it is reachable only from the record that owns the bill.

## 6b. Void a whole bill (the bill AND its payments)

The other statement to 6: there the *cash* was wrong and the bill stays owed; here the **bill should never have existed**, so the cash goes with it. Reachable from the month cell's 3-dot → **Void this month**, from **View bill**'s header 3-dot menu, and — for a sale — from the sale's own **Void sale**.

6b.1 On a **fully unpaid** month that still holds a bill (collect it, then void the hand-over per section 6 — the empty bill stays), the cell menu offers **Void this month**. Confirm: the bill is gone, the cell stays red/unpaid, and re-collecting raises a **fresh** bill (the frozen price is no longer preserved — that is the point of voiding it).
6b.2 On a **paid** month, the cell menu offers **Void this month** *and* **View bill**. The confirm names the month and states that any money collected on it is voided too. It carries **no count** — the wording is the same whether one payment or five are involved.
6b.3 Confirm 6b.2. The cell goes red/unpaid, the money-in history shows the hand-over dimmed + **Voided**, the dashboard revenue and the collector's wallet both drop by that amount.
6b.4 **The wider case, which the message must warn about:** collect 55 across Jan + Feb + a sale (scenario 3), then void **January's** bill. The confirm warns that a payment which also settled another bill is undone in full, making that bill owed again. Confirm — February **and** the sale go back to owed as well, because one physical hand-over cannot be half-undone.
6b.5 A month with **two** hand-overs on it (installments, scenario 2): both are voided, and the confirm reads exactly as it did in 6b.2 (no count, so no wording to get wrong).
6b.6 **View bill** → the header **3-dot menu → Void this month** does exactly the same thing as the cell menu, and the sheet closes itself once the bill is gone.
6b.7 A month with **no bill at all** (never collected) offers **no** void action — there is nothing to void.
6b.8 Cancel the confirm at every entry point: nothing is written, no payment is voided.
6b.9 Admin → Audit Log shows a `charges` **void** entry *and* a `collections` **void** entry per payment, all by the acting user.
6b.10 **Order:** the payments are voided before the bill, so an interrupted run leaves an *unpaid bill* (still owed, recoverable) — never live cash pointing at a voided bill.
6b.11 Offline: do 6b.4 on a device with no network, then sync. The bill and every payment arrive voided; no balance goes negative.
6b.12 **Speed (the regression this guards).** Void a bill carrying **10+** hand-overs, on a device (offline path). It must complete in roughly the time one payment takes — the payments go in **one** UPDATE inside **one** transaction (`voidMany`), not a transaction per row queuing behind `withDbLock`. Same for the money-in history's bulk void of 10+ rows, and for a 10-sale bulk void.
6b.13 **Opening a void dialog costs no reads.** The confirm appears instantly for any bill or selection, however many payments are involved — it states that the money goes without counting it. Watch the network / SQL log: nothing is queried until Confirm is pressed.
6b.14 Audit is still **one entry per hand-over** after a batched void (not one for the batch), and each carries its own `before_data`.
6b.15 **Newest month first.** With July *and* August paid on one service line, **Void this month** on July is refused — a "Not available" popup names August, and the destructive confirm never opens. Void August first, then July: both go through. Same from the bill sheet's header 3-dot menu. Only a **month** bill is gated this way: a **sale** bill and a **hand-typed fee** are voided regardless of any month, and voiding one hand-over (section 6) is never blocked. Full matrix in `payments.md` §8.

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
12.2 No month cell offers to void a *single payment* — that lives in **View bill**, which owns the per-hand-over void. The cell's own **Void this month** is the whole bill, not one payment.
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

## 14. Re-pricing an empty bill (gotcha #106b)

An "empty" bill is a month whose only payment was voided. It must read exactly like a month never touched — **including its price**.

### 14.1 Plan swapped after a void

14.1.1 Put a customer on the default **no-plan** (custom-price) line. Collect the current month for **$50**.
14.1.2 Void that hand-over (View bill → the payment row → Void).
14.1.3 In the customer form, change that line from no-plan to a predefined plan priced **$30**. Save.
14.1.4 Tap the same month cell. The collect sheet must open at **$30**, not $50.
14.1.5 Save it. The bill stored is **$30** — reopen View bill and confirm the owed figure and the receipt both read $30.

### 14.2 Plan price edited after a void

14.2.1 Collect a month on a **$50** plan, then void the hand-over.
14.2.2 Admin → Plans: change that plan's price to **$40**.
14.2.3 Tap the same month cell → the sheet opens at **$40**, and saving bills $40.

### 14.3 A PAID bill is never re-priced

14.3.1 Collect a month at $50 and **do not** void it. Change the plan price to $40.
14.3.2 The month still reads $50 everywhere (grid, View bill, receipt) — the price froze when the money landed.
14.3.3 A **partly** paid month (paid $20 of $50) also keeps $50 after a price change; the sheet still offers the $30 remainder, not a re-priced figure.
14.3.4 Void the *bill* (not the payment) and confirm nothing is re-priced by that action alone.

### 14.4 Currency changes with the price

14.4.1 Collect a month billed in **LBP**, void it, then move the line to a **USD**-priced plan.
14.4.2 The sheet opens in USD at the new amount, and the saved bill's currency **and** its rate snapshot are the USD ones — not the old LBP rate.

### 14.5 Multi-month span changes

14.5.1 Collect a 1-month block at $50, void it, then move the line to a **3-month / $120** plan.
14.5.2 The re-priced block covers **3 months** at $120 — the cells join into one pill, and the stored bill's `duration_months` is 3.

### 14.6 The other collect doors agree

14.6.1 After 14.1.3 (empty bill, plan now $30), use the customer list **quick pay** — it must charge $30.
14.6.2 Use the quick-actions **Collect money** sheet for the same customer — the split preview lists that month at **$30**, and the total owed reflects $30.
14.6.3 The **Debts** screen and the dashboard "still owed" figure do not show the month twice (once at $50, once at $30).

### 14.7 Offline / multi-device

14.7.1 Do 14.1 offline on a device, then sync. The server's bill is the re-priced one, and there is exactly **one** row for that line + month.
14.7.2 Race it: on device A collect the emptied month (billing $30) while device B collects the same month first at $50 and syncs in between. The later write must **not** overwrite a bill that now has money on it — the `paid = 0` guard holds, and no cash is left pointing at a re-priced amount nobody agreed to.
14.7.3 Admin → Audit Log shows a `charges` **update** entry for the re-price, with the old and new amounts.

---

## 15. Collecting a month whose bill is DEAD (voided / written off) — gotcha #115

The bug this covers: `charges` is unique on `(customer_plan_id, billing_month)` **whatever the row's state**, so a voided or written-off month bill is the only row that month can ever have — while every read filters it out. Cash aimed at that month landed on the dead row and disappeared from the grid, staying in the wallet and in revenue.

### 15.1 The reported case — void, then collect again

15.1.1 Customer with a plan-less line carrying a **special price** ($60, USD). Collect October fully.
15.1.2 October cell → **Void this month** (confirm — it takes the payment with it). The cell goes red; October is not on the Debts screen; the wallet and revenue drop by $60.
15.1.3 Collect October again, **same price, same currency** (this is the trap — the old code only revived a bill whose price had changed).
15.1.4 The cell shows **paid**. Pull to refresh / leave and re-open the customer → **still paid**. Restart the app → still paid.
15.1.5 In the DB: exactly **one** `charges` row for that line + month, `voided_at IS NULL`, and one live `collection_items` row against it.
15.1.6 Repeat 15.1.2–15.1.4 twice more. Never more than one bill, and the number of live hand-overs equals the number of times it was actually collected.

### 15.2 Partial → write off → collect

15.2.1 Collect $20 of a $60 October. It appears on the **Debts** screen with $40 still owed.
15.2.2 Debt row menu → **Write off**. It leaves the Debts screen.
15.2.3 The October cell now reads **paid (PARTIAL)** with `20/60`, not red — the $20 was really collected, and a write-off gives up on the remainder only. (Before the fix it read red, which is what invited the double charge.)
15.2.4 Open the bill sheet: the $20 hand-over is listed.
15.2.5 Collect the remaining $40 from the bill sheet. The bill is revived (`written_off_at` back to NULL), the month closes at 60/60, and Reports → Debts stops counting it as a loss.

### 15.3 The optimistic paint must not lie

15.3.1 With a bill artificially left voided in the DB (set `voided_at` by hand) and a `collection_items` row pointed at it, open the customer: the cell is **red**, not green.
15.3.2 This is the guard in `mergeCollection` — money on a dead bill is dropped from the in-memory patch, so a regression shows up immediately instead of after a refresh.

### 15.4 The re-price still works, and still only when it should

15.4.1 Re-run §14 in full — reviving must not have changed any re-pricing behaviour.
15.4.2 A bill with money on it is **never** re-priced, dead or alive: collect $20 of a $60 month, change the line's price to $80, collect the rest → the bill stays $60 and closes at 60/60.

### 15.5 Offline / multi-device

15.5.1 Do 15.1 fully offline, then sync. One bill on the server, un-voided, with the right hand-overs.
15.5.2 Device A voids October and syncs; device B (offline, stale) collects October and syncs after. The bill comes back to life with B's money on it — no orphan cash, and still one row.
15.5.3 Admin → Audit Log shows a `charges` **update** entry for the revive, with `voided_at` going from a timestamp to null.

### 15.6 Nothing else moved

15.6.1 Debts screen: a written-off bill is still absent (now excluded by `ChargeRepository.find`, not by the balance view).
15.6.2 Reports → Debts: "lost to unpaid debts" still counts only the part never collected.
15.6.3 Dashboard revenue and the collector wallet are unchanged for a normal collect.

### 15.7 "Billed on" reads the real raise date

15.7.1 Collect October (say Aug 29). Open the bill sheet — **Billed on** = Aug 29, **Due** = Oct 1.
15.7.2 Void the month, then collect October again on a later day (Aug 31). The bill sheet now reads **Billed on Aug 31** — the day it was actually raised again — not Aug 29. (This was the bug: the revive cleared the void columns but kept the dead bill's `issued_at`, so the FIRST raise showed for ever.)
15.7.3 **Due is unchanged** (still Oct 1) — ageing belongs to the month, so a January month revived in March is still 60+ days late on the Debts screen.
15.7.4 Same for a **written-off** month revived by a later payment: `issued_at` moves to the day the money arrived, `due_date` does not.
15.7.5 A bill that was **never** dead is not re-stamped: collect $20 of October, then the remaining $40 a week later → **Billed on** keeps the original date (only `isDeadBill` rows are patched).
15.7.6 Admin → Audit Log: the revive's `charges` **update** entry now lists `issued_at` among the changed fields, alongside `voided_at`.

## 16. The order is VISIBLE in the collect sheet

The split preview is drawn in the waterfall's own order (`sortByDue`), so the rows can never say one thing while the money does another.

### 16.1 The numbered queue

16.1.1 Re-run the §3 setup (January 20 · February 20 · sale 40 on 5 Mar · fee 20 on 10 Mar) and open the collect sheet.
16.1.2 The rows read **1 January · 2 February · 3 the sale · 4 the fee** — top to bottom, oldest **due date** first. The sale (due 5 Mar) sits **above** the fee (due 10 Mar), and both sit **below** the two months.
16.1.3 Under the "This pays" heading a one-line caption says money goes to the oldest bill first and that a row can be tapped to skip it.
16.1.4 Each row shows its **due date** and, when it is late, **how many days late** — so the order can be checked by eye.

### 16.2 What the number's look means

16.2.1 Type **55**. Rows 1, 2 and 3 get a **filled** number (money reached them); row 4's number is a **hollow outline** (still in the queue, nothing left for it).
16.2.2 Row 1 and 2 read **Pays in full** in green, row 3 **Leaves 25 owing** in amber, row 4 **Not covered** in grey with a **—** amount.
16.2.3 Row 4 (nothing reached it) also prints **20 owed** in its second line, so what it still needs is visible without opening it.

### 16.3 Skipping re-numbers the queue

16.3.1 Untick **February**. Its row greys out, its label is struck through, its badge becomes a **×**, and its status reads **Skipped**.
16.3.2 The rows below **re-number**: the sale becomes **2** and the fee **3** — the money visibly moved down.
16.3.3 The amounts match §4.2 exactly (January 20, sale 35, fee untouched).
16.3.4 Tap February again → it returns to position **2** and the numbering closes back up.

### 16.4 Every door shows the same order

16.4.1 Open the sheet from the **customer list** 3-dot → Collect money: numbered oldest-first.
16.4.2 Open it from the **Collect money** quick action: identical order.
16.4.3 Open it from **Transactions → Debts** → a debtor's 3-dot → Collect, and from the **debtor detail sheet's** "collect all": identical order. (This door hands over two separately-sorted lists glued together — the sheet re-sorts, so it must not differ.)
16.4.4 Two bills sharing the same due date appear in the same order in every door, and in the same order the money lands.

### 16.5 Two currencies

16.5.1 With bills in two currencies, switch the currency picker → only that currency's rows are listed, re-numbered from **1**.
16.5.2 "Still owed after" keeps counting the other currency's bills (it is the whole pool), unchanged from before.

### 16.6 Single-bill mode is unaffected

16.6.1 Collect one bill from a debt row → no "This pays" section at all (there is nothing to order).
16.6.2 An **open-amount** month (no set price) still shows the "Amount for this month" field and no preview.

## 17. Opening the bill behind a hand-over (money-in history)

Setup: in **Money received** (quick actions → "Money received") have (a) a
hand-over that settled ONE month, (b) one that settled ONE sale, (c) one that
settled a month + a sale + a custom fee, and (d) a **voided** row.

### 17.1 The card marker replaced the expander

17.1.1 The multi-bill row (c) shows a grey **3 items** chip — there is **no** `▾` chevron and no inline list any more; the bills themselves are **named** on the line above it (see §19.1).
17.1.2 Tapping the row does not expand anything in place; it opens the split sheet (§17.3).
17.1.3 The single-bill rows (a) and (b) name their bill on the same line, with no chip.

### 17.2 A single-bill hand-over opens its bill

17.2.1 Tap row (a) → the **month bill sheet** opens, titled with the bill's frozen label ("Jan 2026 · Internet").
17.2.2 It shows collected-out-of-owed and every payment that reached that bill — including hand-overs made on other days.
17.2.3 It offers **no Collect button and no 3-dot menu at all** (so no Void this month): this is a history surface, so the bill is read-only here.
17.2.4 Tap row (b) → the **sale receipt** opens instead (its lines, its total, its payments). While it loads, the row's 3-dot slot shows a spinner.
17.2.5 A hand-over that settled a **custom fee** opens the same bill sheet as a month, titled with the fee's description.

### 17.3 A multi-bill hand-over opens the split

17.3.1 Tap row (c) → a sheet titled **What this paid** opens: the hand-over's total, a status pill, then a details block (customer · received to the minute · who took it · where the cash is now · notes) and the bills under **This pays**. See §19.4.
17.3.2 One card per bill, in the order the waterfall filled them, each with its own amount, its own kind icon colour and its frozen label — plus the bill's **total** and **due date**, and when it was billed.
17.3.3 The card amounts **add up to the hand-over's total** exactly.
17.3.4 Every amount prints in the **hand-over's** currency (an item has no currency of its own), with the display-currency value as a `≈` line under the headline only.
17.3.5 Tap the month card → the month bill sheet opens **on top of** the split sheet. Back (or the header dismiss) returns to the split, not to the list.
17.3.6 Tap the sale card → the sale receipt opens the same way; its row shows a spinner while the sale is fetched.
17.3.7 Opening the split sheet triggers **no network read** — the list already carries every item and its charge.

### 17.4 A voided hand-over opens its own record

17.4.1 Row (d) has no 3-dot menu (nothing can be done to it), its amount is **struck through**, and it wears a red **Voided** chip carrying the reason.
17.4.2 Tapping row (d) opens the **split sheet** — its own record. It used to do nothing at all.
17.4.3 It opens the split even when it settled **one** bill: a live row would go straight to that bill, but the bill is owed again and is no longer this row's story.
17.4.4 A voided row shows **no** custody chip — the cash it names does not exist any more.
17.4.5 The sheet lists: the struck-through total, a **kind** pill plus a red **Voided** pill, the customer, when it was received, who took it, the notes, **when it was voided, by whom, and the reason**.
17.4.6 It shows **no** "Cash now with…" row — a voided hand-over holds nothing, so custody there would be a lie.
17.4.7 The bills section is headed **This had paid** with the caption "These bills are owed again", not "This pays".
17.4.8 The bill cards are still tappable, and each opens a bill that now shows the money back as owed.
17.4.9 Void a row from the list, then tap it straight away (no refresh): **Voided by** already names you — the store patch carries it.

### 17.5 Selection mode still wins

17.5.1 Long-press any row to enter selection → tapping rows now **selects** them; no sheet opens.
17.5.2 Leave selection mode → tapping opens the bill again.

### 17.6 Voiding a payment from inside

17.6.1 Open a bill from §17.2, void one of its payments there → the bill's collected figure drops and the row stays owed.
17.6.2 Close back to the money-in list → the voided hand-over now reads **Voided** and stops counting toward its month-section total.

---

## 18. Money-in list: search and section totals (WEB build only)

`collections` owns its `branch_id`, so the customer join in these two queries exists **only** for the search box. Both were joined wrongly, and both symptoms are invisible on native (the SQLite mirror uses a real `LEFT JOIN` and always behaved correctly) — run this section in a **web** build.

**Reference code:** `CollectionRepository.find` / `.monthlyTotals` (the Supabase pair, not `.offline`).

### 18.1 Searching actually filters

18.1.1 Open Money received with several customers' hand-overs listed. Type a name that matches exactly one customer → **only that customer's** hand-overs remain. (Before the fix, PostgREST applied the filter to the embedded customer instead of the parent row, so every hand-over stayed on screen and the non-matching ones simply lost their customer name.)

18.1.2 Type a name that matches nobody → the list is **empty**, not "everything with no names".

18.1.3 Clear the search → every hand-over is back, walk-in rows included.

18.1.4 The section-header total for each month agrees with the rows beneath it while the search is on.

### 18.2 Walk-in cash counts in the section total

18.2.1 Record a **walk-in** sale (no customer) paid in full at the till. It writes a `collections` row with `customer_id = NULL`.

18.2.2 Open Money received with no search term. The walk-in hand-over is listed, and the month's section header **includes its amount**. (Before the fix the header inner-joined `customers`, so walk-in cash was listed but never counted — the header disagreed with its own rows.)

18.2.3 Add up the month's rows by hand and compare with the header — they must match exactly.

18.2.4 Repeat on **native**: the same figures. The web and offline reads must agree.

### 18.3 Nothing else moved

18.3.1 Branch chip filtering still scopes the list and the totals (the branch comes from `collections.branch_id`, never the customer).

18.3.2 A voided hand-over is still listed but still counts for nothing in the header.

18.3.3 One customer's money-in panel (opened from a customer) is unchanged.

---

## 19. Money received — the card, the filters and the totals

What this section tests is **readability**, not new money rules: nothing here changes a balance. The one new stored value is `collections.kind` (what the cash paid for, frozen at collect time), which the type filter reads.

**Reference code:** [CollectionCard.tsx](../SubsTrack/src/modules/ledger/components/CollectionCard.tsx) · [CollectionsPanel.tsx](../SubsTrack/src/modules/ledger/screens/CollectionsPanel.tsx) · [CollectionSplitSheet.tsx](../SubsTrack/src/modules/ledger/components/CollectionSplitSheet.tsx) · [collectionLabel.ts](../SubsTrack/src/modules/ledger/utils/collectionLabel.ts) · [collectionKind.ts](../SubsTrack/src/modules/ledger/utils/collectionKind.ts) · `formatMoneyPair` in [currency.ts](../SubsTrack/src/core/utils/currency.ts)

> Run `sql scripts/script.sql` first — this section needs `collections.kind` and its backfill.

### 19.1 The card reads who → how much → what → who holds it

19.1.1 The **customer's name** is the bold first line, left; the **amount** is bold on the right. (It used to be the other way round.)
19.1.2 A walk-in hand-over (no customer) reads **Walk-in / no customer**, never a blank line.
19.1.3 The second line **names the bills**: one bill prints its label, two print both separated by a comma, four print the first two then **+2 more**.
19.1.4 The third line is **who took the cash · the date and time** (to the minute — nothing on this page prints seconds).
19.1.5 The kind is carried by the **icon colour** — month and sale green (a sale matches the Sales page exactly), custom violet, mixed indigo.
19.1.5a A **kind chip** also names it in words: Month · Sale · Custom · Mixed, tinted to match its icon. Month and sale share the green tint, so the WORD is what tells them apart.
19.1.5b The chip is on **every** row, including voided ones, and sits first — before `N items`, the holder chip and `Voided`.
19.1.5c A **mixed** hand-over reads `Mixed`, never the kind of just one of its bills.
19.1.6 A hand-over of several bills wears a grey **N items** chip.

### 19.2 The amount is the money that was physically handed over

19.2.1 With the display currency set to USD, collect **180,000 LBP**. The card's headline reads `180,000 L.L.` and a small grey `≈ $2.00` sits under it. (It used to read only `$2.00`.)
19.2.2 Collect in USD with the display currency USD → **no** `≈` line at all.
19.2.3 Set the display currency to LBP and collect in LBP → still no `≈` line (it would repeat the same figure).
19.2.4 Send that hand-over's WhatsApp receipt: the amount in the message and the amount on the card are **the same number in the same currency**.
19.2.5 The month section header still totals in the **display** currency (it sums many currencies, so it must convert).

### 19.3 Custody is only mentioned when it moved

19.3.1 A hand-over still held by the collector who took it → **no** custody chip.
19.3.2 Have an admin receive that cash in Wallets, then reopen the list → an amber chip names the **holder**.
19.3.3 Close out (bank) the cash → the chip reads **Banked / handed over**.

### 19.4 The detail sheet says everything the row could not

19.4.1 Open a multi-bill hand-over → customer, received, who took it, where the cash is now, and the **notes** typed when collecting are all listed. (Notes were stored but never shown anywhere before.)
19.4.2 A hand-over with no notes simply has no Notes row — never an empty one.
19.4.3 A **voided** hand-over shows its void time and reason, and its total is struck through.
19.4.4 Each bill card shows the bill's total and due date, and when it was billed. Those figures are the **bill's**, not this payment's — a bill of 50 settled by 20 here shows both numbers.
19.4.5 A bill card does **not** claim a remaining balance. Tap it: the bill sheet is where "collected out of owed" is computed.

### 19.5 The month bill sheet shows the same depth

19.5.1 Open a month bill (from a cell or from the money-in list) → the details block lists the customer, the month billed, the bill total, the due date, when it was billed, who billed it, and the notes.
19.5.2 Every payment row in it shows the time and its collector.
19.5.3 A bill in LBP prints its hero, its remaining and every payment row in **LBP**, with one `≈` display line under the hero. Nothing in the sheet mixes the two currencies.
19.5.4 A 3-month bundle names its whole range in "Month billed" ("Apr – Jun 2026"), exactly as the cells do.

### 19.6 The period is visible, never a silent default

19.6.1 Open Money received: the period chips show **This month** selected, and the exact dates are printed under them. (The screen used to silently show "the last month" with nothing on screen saying so.)
19.6.2 Pick **Last 3 months** → the list and the total both widen; the caption follows.
19.6.3 Pick **Custom** → two date inputs appear; the range applies on change.
19.6.4 A hand-over dated **today** is always inside the default window, and one from two months ago is **not** — widen the period and it appears.

### 19.7 Type, status, sort field and order

19.7.1 Filter **Type → Month**: only hand-overs whose every bill was a month remain. A payment that settled a month **and** a sale is **not** listed.
19.7.2 Filter **Type → Mixed**: exactly those multi-kind hand-overs.
19.7.3 Filter **Type → Sale** and then **Custom**: the same rule per kind.
19.7.4 The section-header totals and the summary bar follow the type filter — the header never totals rows that are filtered out.
19.7.5 Filter **Status → Not voided**: voided rows disappear. **Voided only**: nothing but reversals.
19.7.6 Set **Order → Oldest first**: the list reverses, the month sections come oldest first, and paging on scroll keeps that order (no duplicate or missing rows).
19.7.6a **Sort by** offers exactly three dates — Received date (default), Recorded date, Last updated. There is deliberately no due-date and no amount option (gotcha #129).
19.7.6b Record a payment with a **back-dated** received date (cash taken last week, entered today). Under **Received date** it sits in last week's month section; under **Recorded date** it jumps to the top of today's. The two orders must visibly differ.
19.7.6c Void an old hand-over, then sort by **Last updated**: that row moves to the top (newest first). Its position under Received date is unchanged.
19.7.6d Sort by **Last updated** and scroll past one page: no row appears twice and none is skipped — several rows voided in one action share an `updated_at`, and `created_at` is what breaks that tie.
19.7.6e Each sort field works with **both** directions, and with the period, type, status, customer and collector filters applied at once.
19.7.7 Any filter change resets paging: scroll far down, change the type, and the list starts at the top with the right rows.
19.7.8 **Clear filters** returns to This month · all types · both statuses · Received date · newest first, and the Clear chip is only offered while something is off-default (including a non-default period, sort field or order).

### 19.8 The summary bar

19.8.1 Under the filters, **Collected in this view** shows one total for the whole filter — not just the loaded page. Verify by scrolling: it does not change as more rows load.
19.8.2 It equals the sum of every month section header.
19.8.3 Voided rows contribute **nothing** to it (with Status → Voided only, it reads zero).
19.8.4 Void a listed hand-over from its 3-dot menu → the total drops by that amount with no reload.

### 19.9 The stored kind

19.9.1 Collect one month → the new `collections` row has `kind = 'month'`.
19.9.2 Collect 55 across two months and a sale → `kind = 'mixed'`.
19.9.3 A hand-over recorded **before** this change (its `kind` is NULL until the backfill runs) still shows the right badge and icon in the list — the read derives it from the items.
19.9.4 After running `script.sql`, no live `collections` row has a NULL `kind`; on native, sync brings the backfilled value down and the type filter then matches those rows too.
19.9.5 Offline: collect while offline → the row is written with its kind, filters work against the mirror, and the value that later reaches Postgres is the same one.

---

## 20. The bill sheet's header 3-dot menu (gotcha #131)

`BillSheet` used to end in **two** stacked full-width buttons — a primary
**Collect** and a red **Void this month**. The collect button stays in the body
(a bill is opened to collect it); voiding the bill moved to a 3-dot button in
the sheet header, beside Close, matching the sale receipt (`sales.md` §3A).

Setup: a partly-paid month bill on a customer's grid (**View bill** from the
cell's 3-dot), reached from the customer payment panel — which is the one
surface that passes `onVoidBill`.

20.1 The body ends in exactly **one** full-width button: **Collect $X** (the remaining amount). There is no red bar under it.
20.2 The header reads: the bill's label on the left, then a 3-dot icon and **Close** on the right.
20.3 Tap the 3-dot → an ActionMenu opens titled with the bill's label, holding one red destructive row: **Void this month**.
20.4 A **settled** bill (nothing remaining) shows no Collect button, but the 3-dot is still there with Void this month — that is the only action left.
20.5 Opened from the **money-in history** (§17.2), the sheet passes no `onVoidBill`, so the 3-dot button is **hidden entirely** — a history surface is read-only.
20.6 Menu → Void this month → the caller's own destructive confirm appears (naming the month, stating the money goes). Cancel leaves the bill untouched and the sheet open.
20.7 Confirm → the bill and its payments are voided and **the sheet closes itself**. Same behavior as before the button moved.
20.8 **Newest month first still gates it.** With a later month of the same line paid, Void this month from this menu is refused by the "Not available" popup naming that month — the destructive confirm never opens (the same rule as 6b.15).
20.9 After a refusal in 20.8 the sheet stays open and the menu can be opened again — no wedged backdrop, no dead taps.
20.10 There is **no loading spinner on the void** any more: the confirm dialog blocks while it runs and the sheet dismisses on success, so there is nothing left to spin on. It must not double-fire if the menu row is tapped twice quickly (the menu closes on the first tap).
20.11 Press and drag **down** on the header near the 3-dot → the sheet drags/closes; a plain tap on the icon still opens the menu.
20.12 RTL (Arabic): the 3-dot and Close sit on the leading side and the menu row reads right-to-left.
