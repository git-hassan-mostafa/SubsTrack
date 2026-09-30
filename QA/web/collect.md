# Web — Collect Money Dialog — QA Scenarios

The **Collect money** dialog on the desktop web app: a customer's whole pool (every bill, one section per currency, the pay order shown and steerable) or one bill (including a month with no set price), plus the **Collect money** header quick action. The money rules are the phone collect sheet's — [../ledger-collections.md](../ledger-collections.md) and [../currency-payments.md](../currency-payments.md) — and both apps now run the same shared form state.

**Reference code:**

- Dialog: [CollectDialog.tsx](Web/src/modules/ledger/collect/CollectDialog.tsx), [CurrencyCollectSection.tsx](Web/src/modules/ledger/collect/CurrencyCollectSection.tsx), [AllocationPreview.tsx](Web/src/modules/ledger/collect/AllocationPreview.tsx), [CollectSummary.tsx](Web/src/modules/ledger/collect/CollectSummary.tsx), [useCollectDialog.tsx](Web/src/modules/ledger/collect/useCollectDialog.tsx)
- Quick action: [CollectQuickActionDialog.tsx](Web/src/modules/ledger/collect/CollectQuickActionDialog.tsx), [CustomerPicker.tsx](Web/src/modules/customer/customers/CustomerPicker.tsx), [QuickActionDialogs.tsx](Web/src/app/layout/QuickActionDialogs.tsx)
- Shared with the phone sheet: [useCollectForm.ts](Shared/src/modules/ledger/hooks/useCollectForm.ts), [useCollectSubmit.ts](Shared/src/modules/ledger/hooks/useCollectSubmit.ts), [useCustomerOwed.ts](Shared/src/modules/ledger/hooks/useCustomerOwed.ts), [collectForm.ts](Shared/src/modules/ledger/utils/collectForm.ts), [currencyGroups.ts](Shared/src/modules/ledger/utils/currencyGroups.ts) (unit tests: `tests/suites/collectForm.test.ts` TC-CX-*, `currencyGroups.test.ts` TC-XC-*)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — every Save WRITES money). Use a tenant with an LBP currency, a customer owing two unpaid USD months + an LBP sale debt, and a customer with a custom-priced plan.

---

## 1. One customer's whole pool

| #   | Scenario               | Steps                                                                                 | Expected result                                                                                                                             |
| --- | ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Opens full             | Customers → ⋮ → Collect money on the mixed customer                                   | Title "Collect money", the customer's name under it; the big figure is the total in the display currency; "Owed · 3 bills"                  |
| 1.2 | One box per currency   | Look at the sections                                                                  | A USD card and an LBP card, each with "Received in USD/LBP" pre-filled with what is owed in THAT currency — never converted                  |
| 1.3 | Pay order shown        | Look at "This pays" in the USD card                                                   | Oldest bill first, numbered 1, 2; filled circles where money lands; "Pays in full" chips; "Still owed after" 0                               |
| 1.4 | Part payment           | Type 25 in USD (months are 20 each)                                                   | Bill 1 "Pays in full", bill 2 "Leaves $15.00 owing"; "Still owed after $15.00"                                                              |
| 1.5 | Skip a bill            | Untick bill 1                                                                         | Bill 1 dims and shows "Skipped"; the money now lands on bill 2 first; the numbers re-count                                                  |
| 1.6 | Over the top           | Type 100 in USD                                                                       | The USD box turns red: "The most you can collect is $40.00…"; Save shows a banner "Lower the amount…" and nothing is saved                  |
| 1.7 | Over after a skip      | Untick a bill, then type the full old amount                                          | The message says the most is lower because a bill was skipped                                                                              |
| 1.8 | Only one currency paid | Empty the LBP box, keep USD → Save                                                    | ONE payment (USD) is saved; the LBP debt is still owed                                                                                      |
| 1.9 | Two currencies         | Both boxes full → Save                                                                | TWO payments (one USD, one LBP) with the same date and notes; "Saved $40.00 + 2,000,000 L.L. from {name}."                                  |
| 1.10 | Total collecting      | Change both boxes                                                                     | "Total collecting" at the bottom follows, in the display currency                                                                          |
| 1.11 | Collect all           | Change boxes, then the top "Collect all"                                              | Every box goes back to the full amount owed                                                                                                |
| 1.12 | Nothing typed         | Empty every box → Save                                                                | Banner "Type the amount you received."; it goes away as soon as an amount is typed                                                        |

Known, not from this dialog: the 30 translation keys that end in `_plural` are never read by the installed i18next (it wants `_other`), so 1.1 reads "Owed · 3 bill" on the web AND the phone until those keys are renamed.

## 2. Date, notes, closing

| #   | Scenario             | Steps                                                       | Expected result                                                                                  |
| --- | -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2.1 | Now by default       | Save without touching "Received on"                         | The payment's time is the moment of saving (to the second), not the minute shown in the box       |
| 2.2 | Back-dated           | Pick yesterday 09:30 → Save                                 | The payment shows yesterday 09:30 on the phone's Money received list                             |
| 2.3 | Notes                | Type a note → Save                                          | The note is on every payment this Save made                                                      |
| 2.4 | Discard guard        | Change an amount → X / Esc / Cancel                         | "Discard changes?"; untouched dialog closes at once; a backdrop click never closes it            |
| 2.5 | Spinner              | Save                                                        | Save spins, Cancel and X are off until it finishes                                               |
| 2.6 | Error                | Network off → Save                                          | Red banner at the top of the dialog (the body scrolls up to it); the dialog stays open; nothing saved |

## 3. One bill

| #   | Scenario                 | Steps                                                                                  | Expected result                                                                                           |
| --- | ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 3.1 | Open item (no set price) | Quick pay a customer whose only due plan is custom-priced                              | Title + "{name} · {month · plan}"; the hint "This plan has no set price…"; "Amount for this month" with a currency box |
| 3.2 | Month amount drives it   | Type 30 in "Amount for this month"                                                     | "Amount received" follows to 30, in the same currency (locked)                                             |
| 3.3 | Part of an open month    | Month amount 30, received 10 → Save                                                    | Saved; "The rest stays owed." was shown; the month is paid (partial) and 20 stays owed                    |
| 3.4 | No month amount          | Leave "Amount for this month" empty → Save                                             | Banner "Type what this month costs first."; nothing saved                                                 |
| 3.5 | Other currency           | Pick LBP in "Amount for this month"                                                    | The bill and the payment are in LBP                                                                        |

## 4. Collect money quick action

| #   | Scenario            | Steps                                                                  | Expected result                                                                                            |
| --- | ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 4.1 | Any page, any role  | On any page click the cash icon in the header                          | Tooltip "Collect money"; the dialog opens with only the Customer box                                       |
| 4.2 | Pick a customer     | Type part of a name → pick                                             | A loading bar, then the full collect dialog of §1 with the picker still at the top                          |
| 4.3 | Owes nothing        | Pick a customer who owes nothing                                       | "This customer owes nothing." under the picker                                                             |
| 4.4 | Change customer     | In the full dialog, pick another customer                              | The dialog reloads for the new customer; no bill or amount of the first customer is left                   |
| 4.5 | Save                | Collect → Save                                                         | Dialog closes; an open Customers page re-reads (status and debt change)                                    |
| 4.6 | No customer         | Save with no customer                                                  | Banner "Pick the customer who is paying."                                                                 |
| 4.7 | Branch user         | Log in as a branch user                                                | The picker only finds customers of that branch                                                             |

## 5. Half-saved two-currency payment

| #   | Scenario         | Steps                                                                                                  | Expected result                                                                                                                              |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Second one fails | Two currencies → Save, with the second write failing (DevTools → block the request after the first)   | The dialog closes; "Part of the payment was not saved" names the reason; the first currency IS saved; opening Collect again shows only the rest |
| 5.2 | No double money  | 5.1, then collect again                                                                                | The first currency is NOT collected a second time (the old phone sheet stayed open and a retry saved it twice)                                |
