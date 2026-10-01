# Web — Bill, Payment Details, Correct and Void — QA Scenarios

The dialogs the web opens for ONE bill and the payments on it: the **bill dialog** (figure, status, details, every payment), **payment details**, **Correct amount**, **Void payment**, **Void this month** (the bill and its cash), **Write off / Undo write-off**, and **Write off all** on the Customers list. The money rules are the phone's — [../ledger-collections.md](../ledger-collections.md), [../shared-handover-void.md](../shared-handover-void.md), [../debts.md](../debts.md) — and both apps now run the same shared rules for what a bill allows.

**Where they open:** Write off all is on the Customers list now (§6). The bill dialog and payment details get their doors in the next phases: Money received rows (E3, now — see [money-received.md](money-received.md) §3–§4), a month on the customer page (E4, now — see [customer-detail.md](customer-detail.md) §4–§5, with Void this month and Write off / Undo), the customer's debts panel (E5, with Write off / Undo). Run §1–§5 once a door exists; run §6 and §7 now.

**Reference code:**

- Bill: [BillDialog.tsx](Web/src/modules/ledger/bill/BillDialog.tsx), [BillPaymentsList.tsx](Web/src/modules/ledger/bill/BillPaymentsList.tsx), [BillSummary.tsx](Web/src/modules/ledger/bill/BillSummary.tsx)
- Payment: [PaymentDetailDialog.tsx](Web/src/modules/ledger/payment/PaymentDetailDialog.tsx), [CorrectPaymentDialog.tsx](Web/src/modules/ledger/payment/CorrectPaymentDialog.tsx), [paymentActions.ts](Web/src/modules/ledger/payment/paymentActions.ts)
- Void: [VoidPaymentDialog.tsx](Web/src/modules/ledger/void/VoidPaymentDialog.tsx), [VoidBillDialog.tsx](Web/src/modules/ledger/void/VoidBillDialog.tsx), [SharedBillsWarning.tsx](Web/src/modules/ledger/void/SharedBillsWarning.tsx), [ReasonConfirmDialog.tsx](Web/src/shared/components/ReasonConfirmDialog.tsx)
- Shared with the phone: [billView.ts](Shared/src/modules/ledger/utils/billView.ts), [collectionView.ts](Shared/src/modules/ledger/utils/collectionView.ts), [correction.ts](Shared/src/modules/ledger/utils/correction.ts), [useBillPayments.ts](Shared/src/modules/ledger/hooks/useBillPayments.ts), [useCorrectPayment.ts](Shared/src/modules/ledger/hooks/useCorrectPayment.ts), [useWriteOffActions.ts](Shared/src/modules/ledger/hooks/useWriteOffActions.ts) (unit tests: `tests/suites/billView.test.ts` TC-BV-*, `correction.test.ts` TC-CR-26…30)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — every Save / Void WRITES money). Use a customer with a $20 month paid $5, a month paid in full by a payment that also paid a sale, and an LBP custom fee.

---

## 1. The bill dialog

| #   | Scenario           | Steps                                      | Expected result                                                                                                                          |
| --- | ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Part paid | Open the $20 month paid $5 | Header: calendar icon, "MONTHLY BILL", the month + plan, "For <customer>". Amber panel: "Part paid" pill (icon), "Still owed" $15.00 big, a bar a quarter full, "Paid $5.00 of $20.00", "Part of this bill is paid. $15.00 is still owed." Beside it the details, each with an icon (Month billed, Bill total, Due, Billed on, Billed by) |
| 1.2 | Paid in full | Open a month paid in full | Green panel: "Paid in full" pill, $20.00 big in green, a full green bar, "This bill is fully paid. Nothing is owed."; no Collect button |
| 1.3 | Payments table | Look under the details | "Payments on this bill" with a "1 counted" pill (and "1 voided" when there is one), the hint "Each row is one payment of cash…"; rows: received date (a link), who took it, notes, "Paid to this bill" in green (only the part that reached THIS bill), Status "Counted" green or "Voided" red (hover → the reason), ⋮; rows striped white / light gray |
| 1.4 | Covers others      | Open the month whose payment also paid a sale | That row says "also paid other bills" under the amount                                                                                |
| 1.5 | Own currency       | Open the LBP custom fee                    | Every figure in L.L.; "≈ $…" under the big figure only                                                                                    |
| 1.6 | Collect remaining  | Part-paid bill → "Collect $15.00"          | The caller's collect dialog opens for that bill                                                                                           |
| 1.7 | Send on WhatsApp   | A customer with a phone → "Send bill on WhatsApp" | WhatsApp opens in a new tab with the bill, what was paid and what remains                                                           |
| 1.8 | No phone           | A customer with no phone                   | The button is greyed; hovering says "No phone number for this customer"                                                                   |
| 1.9 | History (admin)    | ⋮ → History                                | The bill's trail AND every payment on it, newest first; as staff, History is not in the menu                                              |
| 1.10 | Voided bill       | Open a voided bill                         | Struck-through total, pill "Voided", "This bill was voided, so this money was voided with it…"; every payment row greyed with "Voided"; no Collect, no WhatsApp |
| 1.11 | Keyboard          | Tab through the dialog; Escape             | Every control shows the blue focus outline; Escape closes the top dialog only                                                           |

## 2. Payment details

| #   | Scenario         | Steps                                        | Expected result                                                                                                  |
| --- | ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2.1 | Opens | Click a payment's date, or ⋮ → Payment details | Header: green payments icon, "PAYMENT RECEIVED", the customer (or "Walk-in / no customer"), "Received <date time>". Green panel: "Amount received", the amount big, ≈ display currency, the kind pill with its icon, "Paid toward 1 bill" / "Split across 2 bills". Beside it Received on, Taken by, Cash now with — each with an icon |
| 2.2 | Banked cash      | A payment handed over to the owner           | "Cash now with: Banked / handed over", Banked on, Banked by                                                       |
| 2.3 | This pays | A payment that paid two bills | "What this payment paid for" + "Click a bill to see all of its payments."; table: Bill (kind icon + link), Bill total, Due, "From this payment" in green — one row per bill |
| 2.4 | Voided payment | Open a voided one | Header turns red: "VOIDED PAYMENT". A red box on top: "This payment was voided" — when, by whom, the reason, "It no longer counts, and the bills it paid are owed again." Gray panel, struck amount; "What this payment had paid for" with struck amounts; no custody row |

## 3. Correct amount

| #   | Scenario            | Steps                                                   | Expected result                                                                                                             |
| --- | ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Opens               | ⋮ → Correct amount on the $5 payment                    | The hint, Amount recorded $5.00, Received on, Collected by; the amount box filled with 5; the bills it paid, in pay order   |
| 3.2 | Lower               | Type 3 → Save correction                                | The dialog closes; the table shows the new $3.00 payment AND the old $5.00 one greyed "Voided"; the bill reads $3.00 / $20.00 |
| 3.3 | Same date, person   | Open the new payment's details                          | Same received date, same collector, same currency; the old one's void reason "Corrected from $5.00 to $3.00 · {your note}" |
| 3.4 | Too much            | Type more than those bills still owe → Save             | The box turns red with the most it can be; banner "Lower the amount…"; nothing saved                                         |
| 3.5 | Zero                | Type 0 → Save                                           | Banner "To take back the whole payment, void it instead."                                                                   |
| 3.6 | No change           | Leave 5 → Save                                          | Banner: it is the same as the amount already recorded                                                                        |
| 3.7 | Closed bill         | Correct a payment whose other bill was written off      | A red banner says to reopen the bill first; no fields                                                                        |
| 3.8 | Close with changes  | Type a new amount → Cancel                              | "Discard changes?" first                                                                                                     |

## 4. Void payment

| #   | Scenario             | Steps                                                  | Expected result                                                                                                  |
| --- | -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 4.1 | One bill             | ⋮ → Void payment on a payment that paid only this bill | "This payment will be undone and the money will be owed again."; a Reason (optional) box; red "Void payment"     |
| 4.2 | Shared payment       | Void the payment that also paid a sale                 | "This payment settled 2 bills…" and the OTHER bill named with its amount (in its own currency, ≈ display)        |
| 4.3 | Done                 | Type a reason → Void payment                           | The button spins; the row goes grey "Voided"; the bill's figure goes back up; the reason shows in payment details |
| 4.4 | Fails                | Network off → Void payment                             | The red banner inside the dialog; the dialog stays open                                                           |

## 5. Void this month, write off, undo

| #   | Scenario            | Steps                                                 | Expected result                                                                                                             |
| --- | ------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Void this month     | ⋮ → Void this month on a paid month                   | The void confirm; its red button waits (spinner) until the other bills are checked, then names every other bill its cash un-pays |
| 5.2 | Write off           | ⋮ → Write off on a part-paid bill                     | "Write this off?" names the remaining amount and the customer; after it: pill "Written off", "$5.00 collected before it was written off" |
| 5.3 | Paid bill           | ⋮ on a settled bill                                    | No Write off (nothing is left to give up on) — the phone bill sheet matches                                                 |
| 5.4 | Undo write-off      | ⋮ → Undo write-off on a written-off bill              | "Undo this write-off?" → the bill is owed again; Collect is back                                                            |

## 6. Write off all (Customers list)

| #   | Scenario            | Steps                                                         | Expected result                                                                                                             |
| --- | ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | In the menu         | ⋮ on a customer who owes something                            | "Write off all" in red at the bottom, with "Give up on everything this customer owes" under it; any role                   |
| 6.2 | Confirm             | Click it                                                      | The row spins, then "Write off all debts?" with the number of bills and the total in the display currency                   |
| 6.3 | Done                | Write off all                                                 | The button spins; the page re-reads; the Debt column empties                                                                |
| 6.4 | Only unpaid months  | A customer whose only debt is this month, never touched       | Blue notice "This customer has no bills to write off. Unpaid months are not billed yet."                                    |
| 6.5 | Owes nothing        | A customer who paid everything                                | No "Write off all" item                                                                                                     |

## 7. Phone regression (same shared code)

The phone bill sheet, its payments list, Correct amount, payment details and bill history now run the shared pieces above. On a phone dev build:

7.1 Open a part-paid month cell → the bill sheet shows the same figure, remaining, details and payments as before.
7.2 Correct a payment, void a payment, open payment details, open History — each behaves as before.
7.3 A settled bill's ⋮ no longer offers Write off (small change, matches §5.3).
7.4 Debts → a debtor → Write off all; Customers → ⋮ → Write off all — same confirm and result as before.
