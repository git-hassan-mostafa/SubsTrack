# Voiding a Shared Hand-Over — QA Scenarios

Covers the **red warning that names the other bills a void un-pays**. Nothing about the money model changed: a `collections` row was always voided **whole**, because it is one physical handing-over of cash and `collection_items` has no void of its own. What is new is that the confirm **names** the bills that go with it, instead of describing the rule in prose that got skimmed. Confirming acts immediately — there is no acknowledgement step.

**The rule**

- One hand-over can settle **several** bills (the waterfall splits it oldest-first).
- Voiding it — from **any** door — reverses **every** slice. There is no partial un-allocation.
- So every void confirm, where the hand-over is shared, lists the **other** bills and what each gets back.
- The bill the user is acting **on** is deliberately **not** listed — that outcome is already expected; listing it buries the surprise.

**Reference code:**
- Pure split→rows: [sharedBills.ts](SubsTrack/src/modules/ledger/utils/sharedBills.ts)
- The banner: [SharedBillsWarning.tsx](SubsTrack/src/modules/ledger/components/SharedBillsWarning.tsx)
- Payment void: [VoidCollectionDialog.tsx](SubsTrack/src/modules/ledger/components/VoidCollectionDialog.tsx)
- Month-bill void: [CustomerPaymentPanel.tsx](SubsTrack/src/modules/customer/customer-payments/components/CustomerPaymentPanel.tsx) (`voidBill`)
- Sale void: [SaleBulkVoidSheet.tsx](SubsTrack/src/modules/transaction/sales/components/SaleBulkVoidSheet.tsx)

---

## 1. The reference setup

Build this once; most sections below reuse it.

1.1 New customer, one plan priced **$50/month**.
1.2 Collect **$30** against September — it stays partial (30/50).
1.3 Collect **$30** against October — September closes ($20 of it) and October takes the rest.
1.4 Record a **$5 sale** for the same customer, **pay later**.
1.5 From the customer's debts card, **Collect $30**. The split preview must read: **September $20 · Sale $5 · October $5**, numbered 1·2·3.
1.6 Confirm. September = paid, the sale = covered, October = partial.

## 2. Month-bill void — the warning names the collateral

2.1 Open October's cell → **Void this month**.
2.2 Below the dialog message, one short paragraph explains **what happened** (the money was handed over once and split) and **what will happen** (the whole payment is cancelled, 2 bills become unpaid again).
2.3 The styling matches the app’s other confirm extras (grey rounded boxes, plain text) — only the amounts are red.
2.4 It lists **September 2026 $20** and **Sale $5** — and **not** October itself.
2.5 Cancel. Nothing changes: September still paid, sale still covered, October still partial.
2.6 Confirm instead. September falls back to **30/50 partial**, the sale is unpaid again, October is unpaid. This is correct — and now it was predicted.
2.7 Money received → the $30 row shows **Voided**, in full. Consistent with 2.6.

## 3. Payment void — the same warning, the other door

3.1 Redo section 1. Open October's `BillSheet` → the $30 payment row → **Void**.
3.2 The same red banner appears, listing **September 2026 $20** and **Sale $5** (October excluded).
3.3 Confirm. Same outcome as 2.6 — the two doors differ only in whether October's **bill** is also voided (it is not, here), so October goes back to plain unpaid and stays in the grid.

## 4. Sale void — third door

4.1 Redo section 1. Sales tab → the $5 sale's 3-dot → **Void sale**.
4.2 The banner lists **September 2026 $20** and **October 2026 $5** — the sale's own bill is excluded.
4.3 Confirm. September partial again, October unpaid, sale voided.
4.4 Multi-select **two** sales settled by one hand-over. The shared bill is listed **once**, not twice, and neither selected sale's own bill appears.

## 5. Waiting for the lookup

5.1 Month void: tap **Void this month**. The cell shows its spinner until the confirm appears — the tap never looks ignored.
5.2 Sale void: the dialog opens at once, shows a spinner where the banner will land, and **Void is disabled** while it spins (the loader gate, nothing else).
5.3 Once loaded, the spinner is replaced by the banner (or by nothing, if no cash is shared) and Void becomes enabled.
5.4 A sale with **no** collected money shows no spinner at all — nothing to look up.

## 6. The un-shared case — no banner at all

6.1 Collect a month in a hand-over that pays **only** that month. Void it (either door).
6.2 **No** red banner appears — there is no collateral. The dialog looks exactly as it did before this change, with no empty gap where the banner would be.
6.3 A hand-over whose other slices were **already voided** likewise shows no banner (only live slices count).

## 7. Currency correctness

7.1 With a non-USD currency (e.g. LBP), repeat section 1 in LBP. Each listed amount prints in **LBP** with the `≈` display-currency suffix where applicable — never a USD figure at an LBP rate.
7.2 A bill settled by **two** hand-overs in **different** currencies stays **two rows** (one per currency). It must never be summed into one figure.
7.3 A bill settled by two hand-overs in the **same** currency merges into **one** row showing the **total**.

## 8. Labels

8.1 A month slice reads as its month ("September 2026"); a **multi-month** bill reads as its range ("Apr – Jun 2026").
8.2 A sale slice reads "Sale"; a hand-typed fee reads its **description**.
8.3 Arabic: the banner, its heading and the singular/plural count all read correctly RTL.

## 9. Failure and edge cases

9.1 Go offline and void a month bill. The lookup runs against the mirror and the banner still appears.
9.2 If the lookup fails, the void is **not** blocked — the confirm still opens with its prose warning. (Force by voiding a bill whose id no longer resolves.)
9.3 A voided sale / voided hand-over offers no void action at all.
9.4 Open and cancel the same void confirm repeatedly. The banner shows the same bills each time and does not accumulate rows.
