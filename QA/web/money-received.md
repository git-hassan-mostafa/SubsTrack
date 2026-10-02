# Web — Money received — QA Scenarios

The web **Money received** page: every hand-over of cash, one row each, in a server-paged table with the phone's filters, a total for the whole filter, row actions and bulk void. The money rules are the phone's — [../ledger-collections.md](../ledger-collections.md) (§26 is the shared filter rule and bulk void), [../shared-handover-void.md](../shared-handover-void.md) — and the dialogs it opens are covered in [bill.md](bill.md).

**Reference code:**

- Page: [MoneyReceivedPage.tsx](Web/src/modules/ledger/received/MoneyReceivedPage.tsx), [MoneyReceivedFilters.tsx](Web/src/modules/ledger/received/MoneyReceivedFilters.tsx), store [collectionsTable.ts](Web/src/state/collectionsTable.ts)
- Dialogs: [VoidPaymentsDialog.tsx](Web/src/modules/ledger/void/VoidPaymentsDialog.tsx), [useBillDialog.tsx](Web/src/modules/ledger/bill/useBillDialog.tsx), [PaymentDetailDialog.tsx](Web/src/modules/ledger/payment/PaymentDetailDialog.tsx), [CorrectPaymentDialog.tsx](Web/src/modules/ledger/payment/CorrectPaymentDialog.tsx)
- Shared with the phone: [collectionFilters.ts](Shared/src/modules/ledger/utils/collectionFilters.ts), `CollectionService.getHistoryPage`, `ICollectionRepository.findPage` (both impls), `ledger.voidCollections`, `BaseRepository.readEveryRow` (unit tests: `tests/suites/moneyReceived.test.ts` TC-MR-*)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — Void and Correct WRITE money). Have this month: a $20 month payment, a payment that paid a month AND a sale, an LBP custom fee payment, a walk-in sale payment, one payment already voided, payments taken by two different staff, and (for §2.5) a branch user.

---

## 1. The table

| #   | Scenario            | Steps                                        | Expected result                                                                                                                                                   |
| --- | ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Opens               | Left nav → Money received                    | Title "Money received"; this month, newest received first; columns Received on, Customer, Paid for, Type, Taken by, Cash now with, (Branch), Amount, Status, ⋮ |
| 1.2 | Header icon         | From any page, click the clock icon (tooltip "Money received") | Goes to the Money received page                                                                                                         |
| 1.3 | Paid for            | Look at the month + sale payment              | "Jan 2026 · Internet, Sale #ABC123" style names — not "2 items"                                                                                                  |
| 1.4 | Walk-in             | Look at the walk-in sale payment              | Customer reads "Walk-in / no customer"                                                                                                                           |
| 1.5 | Own currency        | Look at the LBP payment                       | Amount in L.L., "≈ $…" under it at the rate frozen on the payment (edit today's LBP rate → the "≈" does not move)                                                   |
| 1.6 | Type pill           | Look at the Type column                       | Month / Sale green, Custom violet, Mixed indigo — the phone's colours                                                                                            |
| 1.7 | Cash now with       | A payment an admin already received from the collector; one banked | The admin's name; "Banked / handed over"                                                                                                      |
| 1.8 | Voided row          | Look at the voided payment                    | Row greyed, amount struck, red "Voided" pill; hover the pill → the void reason; Cash now with is empty                                                           |
| 1.9 | Paging              | More than 25 payments → page 2, then 50 per page | The rows change, the count is right, the order stays newest first across pages (no row twice)                                                                  |
| 1.10 | Branch column      | Tenant with 2+ active branches                | A Branch column; a payment with no branch reads "Unassigned"                                                                                                     |

## 2. Filters, search and the total

| #   | Scenario            | Steps                                                          | Expected result                                                                                                                          |
| --- | ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Total bar           | Open the page                                                  | "Collected in this view" = the sum of every LIVE payment in the filter, in the display currency — the voided one does not count             |
| 2.2 | Period              | Period → Last month; then Custom with From / To                 | Rows and total follow; the range shows under the picker for a preset                                                                     |
| 2.3 | Taken by / Type     | Pick one staff member; then Type → Sale                         | Only their payments; then only sale payments; the total follows each time                                                                |
| 2.4 | Status              | Status → Voided only; then Not voided                           | Only the voided payment and **no total bar**; then every live payment and the total back                                                  |
| 2.5 | Branch scope        | Header branch → Branch A; log in as a branch user               | Only Branch A's payments, page 1 again; a branch user sees only their own branch                                                          |
| 2.6 | Sort                | Sort by → Recorded date; Order → Oldest first                   | Rows re-order on the server (not just this page)                                                                                         |
| 2.7 | Search              | Type part of a customer's name                                  | After a short pause only that customer's payments; walk-in payments drop out; the total is for the search too                              |
| 2.8 | Clear filters       | With filters on and nothing found → "Clear filters"             | Back to this month, newest first, all staff / types / statuses, no search; the header branch stays                                        |
| 2.9 | Empty               | A new organization with no payments                             | "No payments" + "Payments show here as soon as money is collected."                                                                       |
| 2.10 | Big period         | TEST project, more than 1000 payments in the period             | The total equals the sum of ALL of them (gotcha #175) — compare with the phone (native, offline mirror) for the same filter              |

## 3. Opening a payment

| #   | Scenario            | Steps                                                   | Expected result                                                                                                     |
| --- | ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Payment details     | Click a Received on date, or ⋮ → Payment details        | The payment details dialog opens AT ONCE with the row's facts (100 rows per page too), then refreshes ([bill.md](bill.md) §2) |
| 3.2 | One bill            | Click "Paid for" on the $20 month payment               | A spinner in the cell if the bill must be read, then the bill dialog for that month (read-only: no Collect, no Void) |
| 3.3 | Many bills          | The month + sale payment                                | "Paid for" is plain text; open details → click a bill in "This pays" → its bill dialog                               |
| 3.4 | A sale bill         | Open the sale bill from details (or its Paid for link)  | The **sale receipt** opens (web/sales.md §3, §7)                                                                    |
| 3.5 | Change inside       | In a bill dialog, void one of its payments, close        | The Money received table re-reads: that payment is greyed and the total dropped                                     |

## 4. Row actions

| #   | Scenario            | Steps                                                           | Expected result                                                                                                                  |
| --- | ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Menu                | ⋮ on a live payment                                             | Payment details · Send on WhatsApp (only with a valid phone) · Correct amount · Void payment                                     |
| 4.2 | Voided menu         | ⋮ on the voided payment                                         | Payment details only                                                                                                             |
| 4.3 | Send                | ⋮ → Send on WhatsApp                                            | The row spins, then wa.me opens in a new tab with the receipt text; if the browser blocks the tab, a "Send it on WhatsApp" dialog offers Open WhatsApp |
| 4.4 | Correct             | ⋮ → Correct amount → type the right figure → Save               | The table re-reads: the old payment voided, the new one at the SAME received date and collector ([bill.md](bill.md) §3)            |
| 4.5 | Void one            | ⋮ → Void payment on the $20 month payment → reason → Void       | "This payment will be undone…"; after Void the row is greyed with the reason, the total drops by $20                              |
| 4.6 | Void a shared one   | ⋮ → Void payment on the month + sale payment                    | "This payment settled 2 bills…" and both bills listed with their amounts                                                          |
| 4.7 | Void error          | Cut the network → Void                                          | The error shows inside the dialog; it stays open; nothing is greyed                                                               |

## 5. Bulk void

| #   | Scenario            | Steps                                                         | Expected result                                                                                                   |
| --- | ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 5.1 | Select              | Tick 3 rows                                                   | The toolbar becomes the bulk bar "3 selected" with Void payment                                                   |
| 5.2 | Only voided ticked  | Tick only the voided row                                      | No bulk action                                                                                                    |
| 5.3 | Mixed               | Tick 2 live + the voided row → Void payment                   | "Void 2 payments" — the voided one is left out                                                                    |
| 5.4 | Void many           | Confirm with a reason                                         | ONE write; both rows greyed with the reason; the total drops by both; the selection clears                         |
| 5.5 | Every role          | Log in as a plain user                                        | Checkboxes and Void are there (the phone lets every role void from this list)                                     |

## 6. Freshness

| #   | Scenario            | Steps                                                                 | Expected result                                                      |
| --- | ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 6.1 | Collect elsewhere   | Customers → Quick pay a customer → back to Money received              | The new payment is at the top (the page re-reads on every open)        |
| 6.2 | Quick action here   | On Money received, header Collect money → save                         | The table re-reads at once                                           |
| 6.3 | Log out             | Change filters, log out, log in as someone else                        | This month, no filters, no rows from the last session                |
