# Store Freshness After a Write — QA Scenarios

Cross-cutting. Covers the app-wide rule that **a create, an edit or a delete updates the store from what the write returned — it does not re-read the table**. Nothing here is a new feature: every screen below already worked. What is being tested is that each list, badge and section total is *still correct* now that it is patched in memory instead of refetched, and that the two deliberate exceptions still re-read.

**The rule**

- **Create / edit / collect** → always patched. No spinner, no list flash, no second query.
- **Void of a plain record** (an expense, one hand-over) → patched.
- **Void that also voids hand-overs** (a month bill, a sale) → **re-reads**. Such a write voids the cash on the bill, and one of those hand-overs may also have settled ANOTHER bill on the same screen — which the write never names, so the store cannot know it moved.
- **A list that is filtered or searched** → **re-reads** after a create / edit. Whether the saved row still matches the filter is a server question, so the app asks it rather than guessing.
- **The debts surfaces** → the write cannot patch an aggregate, so it **announces** the change (`ledger.owedVersion`) and they re-read themselves. That is what section 7 tests.

**Reference code:**
- Sale list patches (pure): [saleListPatch.ts](SubsTrack/src/modules/transaction/sales/utils/saleListPatch.ts)
- Stock deltas from a cart: [saleLines.ts](SubsTrack/src/modules/transaction/sales/utils/saleLines.ts)
- Section-total patch: [monthSections.ts](SubsTrack/src/shared/lib/monthSections.ts) (`addMonthTotal`)
- Sales slice: [saleSlice.ts](SubsTrack/src/state/slices/sales/saleSlice.ts)
- Products slice: [productSlice.ts](SubsTrack/src/state/slices/products/productSlice.ts) (`applyStockDelta`)
- Expenses slice: [expenseSlice.ts](SubsTrack/src/state/slices/expenses/expenseSlice.ts)
- Money-in history slice: [collectionsListSlice.ts](SubsTrack/src/state/slices/collections/collectionsListSlice.ts)
- Money fan-out: [ledgerSlice.ts](SubsTrack/src/state/slices/ledger/ledgerSlice.ts) (`collect` / `voidCollection`)

---

## 1. Sales — the list, its month headers and the stock behind it

1.1 Record a sale from the Sales tab. The row appears at the top **immediately**, with no full-list spinner and no visible reload.
1.2 The month section header above it grows by the sale's **value sold** (total, in USD via the sale's rate) — not by what was collected at the till.
1.3 Record a sale whose month has no other sale yet. The new "Today" section shows the sale's own total; no header shows a wrong figure.
1.4 Pull to refresh. Every section header reads the same number it did before the refresh.
1.5 Record a sale of 3 units of a product. Open Admin → Products: on-hand has dropped by exactly 3, without opening the products screen having triggered a reload.
1.6 Edit that sale down to 1 unit. On-hand goes back up by 2; the row's total and the month header both move by the difference.
1.7 Edit a sale's **notes only**. On-hand does not move at all, and the month header does not move.
1.8 Edit a sale into a different currency. The month header moves by (new total ÷ new rate) − (old total ÷ old rate).
1.9 Void a sale. The row disappears, the header drops by its value, and on-hand goes back up.
1.10 Multi-select three sales and void them together. All three disappear, each month header drops once, and every product's on-hand is corrected in one repaint.
1.11 Edit a sale from the receipt sheet (3-dot → Edit sale). Same as 1.6 — the list behind the sheet is already correct when the sheet closes.
1.12 Filter the Sales tab by customer A, then edit one of those sales and change its customer to B. The row leaves the list (the filtered list re-reads).
1.13 Filter by product P, then edit a sale to remove product P from it. The row leaves the list.
1.14 With a date range ending yesterday, record a sale. It does not appear in the filtered list; clearing the range shows it.
1.15 With NO filter and NO search, repeat 1.1 and 1.6 and watch closely: there is no second spinner and no list flash after the sheet closes.

## 2. Sales — the two customer-scoped lists

Run each on the **customer detail preview** (5 rows + "Show all") and on the **full customer sales page**.

2.1 Record a sale for the customer. It appears at the top of the list without a reload.
2.2 On the preview: with exactly 5 sales already listed, record a sixth. The "Show all" link appears.
2.3 On the preview: void a sale. The list re-reads (this is the documented exception) and "Show all" is still correct.
2.4 Edit a sale and **change its customer** to someone else. The sale leaves this customer's list.
2.5 Collect what is still owed on a sale (3-dot → Collect). The row's paid figure moves here **and** on the Sales tab, with neither list reloading.
2.6 Open the receipt and void one payment on it. The row's paid figure drops on both lists.
2.7 On the full customer sales page, type a search term, then edit a sale so its items no longer match. The list re-reads and the row leaves.

## 3. Money in — collect and its fan-out

3.1 Collect against a pay-later sale from the **Debts** screen. Go to the Sales tab: that sale already shows the new paid figure (no visit-time refetch needed).
3.2 Collect a month from the customer grid. The cell turns green instantly (unchanged behavior) and no sale row moves.
3.3 Collect one hand-over that settles a month **and** a sale. The month cell and the sale row both move; the amounts add up to the cash handed over.
3.4 In the money-in history (quick actions → Money received), void a hand-over. Its row stays, marked voided, and the month section total drops by exactly that amount **without a reload**.
3.5 Void the same hand-over again (if the UI allows re-selecting it). The section total does not drop twice.
3.6 That voided hand-over had settled a sale: the Sales tab shows the sale's paid figure back down.

## 4. Expenses

4.1 Add an expense dated today. It appears in the list at the right position and the three totals (Total / Manual / Stock) all move by its USD value.
4.2 Add an expense dated **outside** the shown date range. It is saved but does **not** appear; widening the range shows it with the correct totals.
4.3 As a tenant-wide admin filtered to one branch, add a **company-wide** (no branch) expense. It does not appear in the filtered view; switching to All Branches shows it.
4.4 Void an expense. It leaves the list and all three totals drop by its USD value.
4.5 Void an expense in a non-USD currency. The totals drop by amount ÷ its own frozen rate, not by today's rate.
4.6 Pull to refresh after 4.1–4.5. Every figure matches what was on screen.

## 5. Month grid — the exception

5.1 Pay January and February with ONE hand-over. Void **January's bill** ("Void this month"). Both January and February go back to unpaid — the grid re-reads, so February is not left falsely green.
5.2 Void a single hand-over from inside the bill sheet instead. The bill's cell repaints from memory (no reload) and only that bill is affected.

## 6. Debts — what a write announces

All three panels below (payments grid, sales, debts) sit on ONE screen, so nothing here involves leaving and coming back.

6.1 On a customer's detail page, record a sale for **more than the customer pays now** (leave part owing). The **Debts** panel at the bottom of the same page shows the new debt straight away — no scroll away and back.
6.2 Same page: part-pay a month in the grid (pay less than the month's price). The Debts panel shows the remainder straight away.
6.3 Same page: add a hand-typed fee from the Debts panel's + button. It appears with no reload of the page.
6.4 Same page: collect against a debt row. The row drops off (or its balance falls) and the panel total follows.
6.5 Same page: void a hand-typed fee, and write another one off. Both leave the panel immediately.
6.6 Open **Transactions → Debts**, leave it on screen, and record a sale with debt from the 3-dot **quick actions** menu. The debtor list and the total at the top both update without switching tabs.
6.7 Same tab: collect from a debtor's sheet. The list and the total update once — watch for a double flicker, which would mean the reload fired twice.
6.8 Customer list → select several customers → **Collect all due**. The "Has debts" flags update once at the end, not once per customer (watch the list does not flash repeatedly).
6.9 Repeat 6.1 and 6.2 offline. Same behavior — the announcement is local, not a server round trip.

## 7. Offline

7.1 Repeat 1.1, 1.6, 1.9, 4.1 and 4.4 with the device offline. Every screen behaves identically — the patch comes from the local write, not the network.
7.2 Reconnect and sync. No figure changes as a result of the sync (the patched values already matched what was written).
