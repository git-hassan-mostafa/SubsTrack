# Web — Debts — QA Scenarios

The web **Debts** page: who owes and how far behind (Debtors), every open bill of every customer (All debts), every past bill and what became of it (History), the debtor dialog, and the custom debt form (add + edit) — also opened from the header quick action and the customer page's Debts panel. The money rules are the phone's — [../debts.md](../debts.md), [../ledger-collections.md](../ledger-collections.md) — and the bill / collect dialogs it opens are covered in [bill.md](bill.md) and [collect.md](collect.md).

**Reference code:**

- Page: [DebtsPage.tsx](Web/src/modules/transaction/debts/DebtsPage.tsx), [DebtorsTab.tsx](Web/src/modules/transaction/debts/DebtorsTab.tsx), [AllDebtsTab.tsx](Web/src/modules/transaction/debts/AllDebtsTab.tsx), [DebtHistoryTab.tsx](Web/src/modules/transaction/debts/DebtHistoryTab.tsx), store [debtHistoryTable.ts](Web/src/state/debtHistoryTable.ts)
- Dialogs and doors: [DebtorDialog.tsx](Web/src/modules/transaction/debts/DebtorDialog.tsx), [CustomDebtFormDialog.tsx](Web/src/modules/transaction/debts/CustomDebtFormDialog.tsx), [useDebtDoors.tsx](Web/src/modules/transaction/debts/useDebtDoors.tsx), [DebtItemsTable.tsx](Web/src/modules/transaction/debts/DebtItemsTable.tsx)
- Shared with the phone: [useCustomDebtForm.ts](Shared/src/modules/transaction/debts/hooks/useCustomDebtForm.ts), [customDebtForm.ts](Shared/src/modules/transaction/debts/utils/customDebtForm.ts), [debtorView.ts](Shared/src/modules/transaction/debts/utils/debtorView.ts), `debtHistoryReadOptions`, `ChargeService.getChargeHistoryPage`, `IChargeRepository.findHistoryPage` (both impls), `debtItemActions` (unit tests: `tests/suites/debtsPage.test.ts` TC-DP-* / TC-CDF-*, `chargeEdits.test.ts` TC-CH-48*, `customerPanels.test.ts` TC-CP-08)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — Collect, Write off, Remove and Save WRITE money). Have: a customer with a part-paid month and a pay-later sale; a customer with an LBP custom fee that took some money; a written-off custom fee; a customer whose bills are all on time; more than 25 past bills; a branch user.

---

## 1. Opening the page

| #   | Scenario      | Steps                                        | Expected result                                                                                                                                         |
| --- | ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Opens         | Left nav → Debts                             | Title "Debts"; a spinner, then the summary bar and the **Debtors** tab                                                                                   |
| 1.2 | Summary       | Look at the bar                              | "Total outstanding" in red, "Owed by N customers", and Month / Sale / Custom amounts that **add up to the total exactly**                                   |
| 1.3 | Same as phone | Same branch on the phone Debts screen        | Same total, same customer count                                                                                                                          |
| 1.4 | Tab in the address | Pick All debts, open a customer, press Back | Comes back on **All debts** (`?tab=all`)                                                                                                             |
| 1.5 | Branch        | Header branch → Branch A                     | Every tab re-reads for Branch A; History goes back to page 1                                                                                             |
| 1.6 | Refresh       | Click the refresh icon                       | The bar shows progress, then the figures read again                                                                                                       |

## 2. Debtors

| #   | Scenario        | Steps                                         | Expected result                                                                                                       |
| --- | --------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Order           | Look at the list                              | Most days late first, then the biggest debt; columns Customer, How late, Bills, Debt, ⋮                               |
| 2.2 | Not late        | The customer whose bills are on time          | "Not late yet" in grey (others "Oldest N days late" in red)                                                           |
| 2.3 | Search          | Type part of a name, any case                 | After a short pause only matching customers; no match → "No debtors" + the search hint                          |
| 2.4 | Debtor dialog   | Click a name                                  | Dialog: "DEBTOR", the name, "$X · Total outstanding"; tabs Owed now / Written off; the bills newest created first      |
| 2.5 | Collect all     | In the dialog → "Collect $X"                  | The collect dialog opens over it with every bill; Save → the debtor dialog and the list update (no reload needed)      |
| 2.6 | Paid in full    | Collect everything one debtor owes            | The debtor leaves the list and its dialog closes by itself                                                             |
| 2.7 | Row menu        | ⋮ on a row                                    | View debts, Open customer page, Collect, Write off all (red) — in that order                                           |
| 2.8 | Write off all   | ⋮ → Write off all → confirm                   | The confirm names the amount; after it the debtor leaves the list and the total drops by exactly that much              |
| 2.9 | Written off tab | Dialog → Written off                          | The written-off fee shows greyed, its only action is **Undo write-off**; undo → it moves back to Owed now              |
| 2.10 | Customer page  | Dialog ⋮ → Open customer page                 | Goes to `/customers/:id`                                                                                                |

## 3. All debts

| #   | Scenario      | Steps                                              | Expected result                                                                                                   |
| --- | ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 3.1 | Opens         | All debts tab                                      | Every open bill of every customer, a Customer column (link to the page), the total bar "Total of N bills shown"   |
| 3.2 | Total matches | No filter                                          | The bar's amount = the page's Total outstanding                                                                    |
| 3.3 | Filters       | Type → Custom; Status → Late; Sort → Largest first | Rows and the bar follow each one; "Clear filters" appears and puts everything back                                  |
| 3.4 | Search        | Open the tab, type a customer name, then a bill label, then Clear filters | Opens without an error; matches either; Clear empties the box and it stays empty (gotcha #183)            |
| 3.5 | Written off   | Scope → Written off                                | Status filter disappears; the bar reads "Written off, N bills shown" in grey; only Undo write-off on each row        |
| 3.6 | Open a bill   | Click a bill name; click a sale's bill             | The bill dialog opens (Collect the rest, Write off work from it); a sale opens its **receipt**                      |

## 4. History

| #   | Scenario      | Steps                                         | Expected result                                                                                                                   |
| --- | ------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Opens         | History tab                                   | Every past bill that left someone owing, newest created first; columns Customer, Bill, Type, Due date, Billed, Paid on the day, Still owed, What happened, Settled on |
| 4.2 | Paging        | More than 25 bills → page 2, 50 per page      | The count is the whole filter's; no bill twice across pages                                                                        |
| 4.3 | What happened | A bill paid later, late                        | "Settled" + "Paid later $X" + "Settled N days late"; Settled on = the day the last live payment arrived                             |
| 4.4 | Still owed    | An open old bill                              | "Unpaid" or "Part paid" + "N days late"; no Settled on                                                                            |
| 4.5 | Filters       | Period → Last 3 months; pick a customer; Outcome → Settled; Type → Sale; Sort → Oldest due first | Each re-reads on the server and goes to page 1; Clear filters puts all back                           |
| 4.6 | After a write | Collect a debt on another tab, come back      | History has re-read once (the stale signal), not on every open                                                                    |
| 4.7 | Branch user   | Log in as a branch user                       | Only their branch's bills                                                                                                          |

## 5. Custom debt form

| #   | Scenario         | Steps                                                    | Expected result                                                                                                       |
| --- | ---------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 5.1 | Three doors      | Page "Add custom debt"; header icon (tooltip "Add custom debt"); customer page Debts panel "Add custom debt" | Same form; from the customer page (and the debtor dialog) the customer is filled in and locked |
| 5.2 | Required         | Open it, type nothing                                    | Save is greyed; Customer and Amount carry the required mark                                                            |
| 5.3 | Add              | Pick a customer, 25, a note, a due date → Add custom debt | Closes; the debt shows on Debts (Debtors + All debts) and on the customer page with no reload                          |
| 5.4 | New customer     | Person icon beside the picker → save a new customer       | The new customer is picked in the debt form; the debt form is NOT saved by it                                         |
| 5.5 | Close untouched  | Open the form, close it                                  | Closes with no "discard?" question (even with a remembered last currency)                                               |
| 5.6 | Close after typing | Type an amount, press Esc                              | Asks to discard                                                                                                         |
| 5.7 | Edit             | ⋮ → Edit on a custom fee                                 | Opens on its own values; the customer is locked                                                                         |
| 5.8 | Part-paid edit   | Edit the LBP fee that took money                         | Currency locked with the "already collected" hint; an amount below it → red message under the box and Save greyed      |
| 5.9 | Rate stays frozen | Change today's LBP rate in Currencies, then edit only the note of that fee | Its "≈ $" value does **not** move (the bill's frozen rate is kept)                               |
| 5.10 | Remove          | ⋮ → Remove on an unpaid custom fee → confirm             | Gone everywhere; on a paid fee the reason shows in the red banner                                                      |
| 5.11 | Written off     | ⋮ on a written-off custom fee                             | Only **Undo write-off** — no Edit, no Remove                                                                             |

## 6. Phone regression (the shared code)

| #   | Scenario            | Steps                                                       | Expected result                                                         |
| --- | ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| 6.1 | Phone custom debt   | Phone: add, edit (part-paid LBP fee: only the note) a custom debt | Same rules as 5.2–5.9; the rate stays frozen                         |
| 6.2 | Phone sheets        | Phone: Debts → All debts and Debt history filters           | Same option lists and order as before                                   |
| 6.3 | Phone written off   | Phone: a written-off custom fee in a written-off list       | Only Undo write-off                                                     |
