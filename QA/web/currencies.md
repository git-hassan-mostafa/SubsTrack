# Web — Currencies Page — QA Scenarios

The **Currencies** admin page on the desktop web app. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §5.8, §6, §7 and §9 on this page (same steps, "currency" instead of "branch"). The currency rules are the phone's: [../currencies.md](../currencies.md).

**Reference code:**

- Page: [CurrenciesPage.tsx](Web/src/modules/admin/currencies/CurrenciesPage.tsx), [CurrencyFormDialog.tsx](Web/src/modules/admin/currencies/CurrencyFormDialog.tsx)
- Page state: [currenciesTable.ts](Web/src/state/currenciesTable.ts)
- Server read: `findPage` in [CurrencyRepository.ts](Shared/src/modules/admin/currencies/repository/CurrencyRepository.ts) (phone twin: [CurrencyRepository.offline.ts](SubsTrack/src/modules/admin/currencies/repository/CurrencyRepository.offline.ts))

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project. Sign in as an admin.

---

## 1. The list

| #   | Scenario        | Steps                                   | Expected result                                                                                                  |
| --- | --------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1.1 | Columns         | Open Admin → Currencies                 | Code, Name, Symbol ("—" when none), Rate ("89,500" with "per 1 USD" under it), Decimal places, Status, ⋮          |
| 1.2 | Order           | Look at the list                        | Active first, then inactive; A→Z by code inside each group                                                       |
| 1.3 | USD line        | Look above the table                    | "USD · USD is the base currency and cannot be edited." USD is never a row, never editable                        |
| 1.4 | Rate format     | A rate of 0.000125                      | Shown as "0.000125" (up to 6 decimals), not rounded to 0.00                                                      |
| 1.5 | Numbers aligned | Look at Rate and Decimal places         | Both columns line up on the right                                                                                |
| 1.6 | Search          | Type "leb", then "LBP"                  | Matches on the name, then on the code; case does not matter                                                      |
| 1.7 | Empty tenant    | Tenant with no currencies               | "No currencies yet", "Add a currency to take money in it, next to USD." and an "Add currency" button; the USD line still shows |

## 2. Add and edit

| #   | Scenario            | Steps                                              | Expected result                                                                           |
| --- | ------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2.1 | Add                 | "Add currency" → LBP, Lebanese Pound, ل.ل, 89500, 0 → Save | Dialog closes; LBP is in the list; it is now in every price field's currency menu     |
| 2.2 | Code in capitals    | Type "lbp"                                         | The field shows "LBP"; stops at 8 letters                                                 |
| 2.3 | USD refused         | Code "USD"                                         | Red banner in the dialog: USD is the base currency                                        |
| 2.4 | Bad code            | Code "L1"                                          | Red banner: the code must be 2–8 letters                                                  |
| 2.5 | Empty fields        | Save with the name or the rate empty               | Red banner naming the problem; Save is never greyed out                                   |
| 2.6 | Rate zero           | Rate 0                                             | Red banner: the rate must be more than 0                                                  |
| 2.7 | Rate keeps digits   | Type "8a9.5.0"                                     | The field keeps only "89.50"                                                              |
| 2.8 | Decimals            | Type "12" in Decimal places                        | Only one digit is kept                                                                    |
| 2.9 | Duplicate code      | Add a code that already exists                     | Red banner: the code already exists; the dialog stays open                                |
| 2.10 | Rate label follows | Type code "EUR"                                    | Rate label reads "Rate (1 USD = ? EUR)", the hint "How many EUR equal 1 USD."             |
| 2.11 | Edit               | Click a code in the table, change the rate, Save   | Row updates. Old bills and payments keep the rate they were saved with                    |
| 2.12 | Inactive note      | Open an inactive currency                          | Amber note: inactive, can't be picked for new plans or payments; reactivate to use it again |
| 2.13 | Discard guard      | Run [app-shell.md](app-shell.md) §5 on this form   | As written there                                                                          |

## 3. Row menu

| #   | Scenario                   | Steps                                           | Expected result                                                                                     |
| --- | -------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3.1 | Items                      | ⋮ on an active / an inactive currency           | Edit, History, Deactivate (red), Delete (red) / Edit, History, Reactivate, Delete                    |
| 3.2 | Deactivate an unused one   | Deactivate a currency nothing uses → confirm    | The row stays, now "Inactive" — it is NOT removed (only Delete removes)                              |
| 3.3 | Delete an unused one       | Delete a currency nothing uses                  | Confirm "Delete Currency"; the row is gone                                                           |
| 3.4 | Delete a used one          | Delete a currency a plan or payment uses        | It becomes Inactive instead (kept for history)                                                       |
| 3.5 | Reactivate                 | Reactivate an inactive currency                 | Green "Active" chip; it is back in the currency menus                                                |
| 3.6 | History                    | ⋮ → History after 2.11                          | The rate change as a sentence, newest first                                                          |
| 3.7 | Bulk                       | Tick 1 row / tick 3 rows                        | 1: Edit, Deactivate or Reactivate, Delete. 3: Delete only ("Delete 3 currencies")                    |
