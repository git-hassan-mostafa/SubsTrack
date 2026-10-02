# Web — Customer Page — QA Scenarios

The web customer page, part 1: the **service-line tabs**, the **year card**, the months as a **list** (a table, one row per month) or a **grid** (coloured tiles) — switched by two icons at the top right — with their click rules and ⋮ menus, picking several months and the bulk bar, the **skip / unskip** dialog, **Void this month**, and the `?quickPay=1` link. Part 2 (§11–§15): the **Details** panel (map link, portal link copy, status), Activate / Delete in the ⋮ beside Edit, the **Debts** panel (owed now / written off, collect, write off, undo, remove a custom debt, collect all, write off all) and the **Sales** panel (latest 10, collect the rest, the bill, history). The receipt, Send invoice and Void sale arrived with the Sales page ([sales.md](sales.md), F1); recording / editing a sale and adding / editing a custom debt come with F2–F3.

The rules are the phone's, and both apps now run the **same Shared code** for them — [../monthly-grid.md](../monthly-grid.md), [../payments.md](../payments.md), [../multiple-plans.md](../multiple-plans.md), [../ledger-collections.md](../ledger-collections.md). Months are paid **oldest first** and voided **newest first**; a skip that a later paid month locks can only be collected.

**Reference code:**

- Web: [CustomerDetailPage.tsx](Web/src/modules/customer/customer-detail/CustomerDetailPage.tsx), [MonthPanel.tsx](Web/src/modules/customer/customer-payments/MonthPanel.tsx), [YearCard.tsx](Web/src/modules/customer/customer-payments/YearCard.tsx), [MonthsTable.tsx](Web/src/modules/customer/customer-payments/MonthsTable.tsx), [monthStatusLook.ts](Web/src/modules/customer/customer-payments/monthStatusLook.ts), [MonthGrid.tsx](Web/src/modules/customer/customer-payments/MonthGrid.tsx), [MonthCell.tsx](Web/src/modules/customer/customer-payments/MonthCell.tsx), [monthCellLook.ts](Web/src/modules/customer/customer-payments/monthCellLook.ts), [LineTabs.tsx](Web/src/modules/customer/customer-payments/LineTabs.tsx), [SkipMonthsDialog.tsx](Web/src/modules/customer/customer-payments/SkipMonthsDialog.tsx)
- Web part 2: [CustomerDetailsPanel.tsx](Web/src/modules/customer/customer-detail/CustomerDetailsPanel.tsx), [CustomerDebtsPanel.tsx](Web/src/modules/transaction/debts/CustomerDebtsPanel.tsx), [CustomerSalesPanel.tsx](Web/src/modules/transaction/sales/CustomerSalesPanel.tsx), [useCustomerAdminActions.ts](Web/src/modules/customer/customers/useCustomerAdminActions.ts), [useBillDialog.tsx](Web/src/modules/ledger/bill/useBillDialog.tsx)
- Shared part 2 (both apps): [useCustomerDebts.ts](Shared/src/modules/transaction/debts/hooks/useCustomerDebts.ts), [useRemoveCustomDebt.ts](Shared/src/modules/transaction/debts/hooks/useRemoveCustomDebt.ts), [debtItemView.ts](Shared/src/modules/transaction/debts/utils/debtItemView.ts), [useCustomerSalesPreview.ts](Shared/src/modules/transaction/sales/hooks/useCustomerSalesPreview.ts), [saleView.ts](Shared/src/modules/transaction/sales/utils/saleView.ts), [locationLink.ts](Shared/src/core/utils/locationLink.ts), `owedUsd` in [debtRule.ts](Shared/src/modules/ledger/utils/debtRule.ts) (unit tests: `tests/suites/customerPanels.test.ts` TC-CP-*)
- Shared with the phone: [useCustomerMonthGrid.ts](Shared/src/modules/customer/customer-payments/hooks/useCustomerMonthGrid.ts), [useLineGrid.ts](Shared/src/modules/customer/customer-payments/hooks/useLineGrid.ts), [useSkipMonths.ts](Shared/src/modules/customer/customer-payments/hooks/useSkipMonths.ts), [monthActions.ts](Shared/src/modules/customer/customer-payments/utils/monthActions.ts), [monthGridLayout.ts](Shared/src/modules/customer/customer-payments/utils/monthGridLayout.ts), [gridSummary.ts](Shared/src/modules/customer/customer-payments/utils/gridSummary.ts), [skipText.ts](Shared/src/modules/customer/customer-payments/utils/skipText.ts) (unit tests: `tests/suites/monthActions.test.ts` TC-MA-*)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — every pay, skip and void WRITES). Use: a regular customer on a $20 monthly plan started in January with Jan–Mar paid and April paid $5; a customer with two lines (monthly + 3-month); a customer on a custom-priced plan; a non-regular customer; a customer with no phone; a cancelled line. For part 2 also: a customer with a part-paid custom debt 10 days late, a written-off sale, a pay-later sale, a voided sale, an address + area + map link + notes, and the portal switched on (the SaaS owner has set `CustomerPortalUrl`).

---

## 1. Opening the page

| #   | Scenario         | Steps                                                    | Expected result                                                                                       |
| --- | ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1.1 | From the list    | Customers → click a customer's name                      | `/customers/<id>` opens; "Customers" stays selected in the left nav; the name is the page heading     |
| 1.2 | New tab          | Middle-click (or Ctrl+click) a name                      | The page opens in a new tab, signed in                                                                |
| 1.3 | Edit is still there | Customers → ⋮ → Edit                                  | The customer form opens on the list as before                                                         |
| 1.4 | Back             | ← (tooltip "Back to customers")                          | The Customers list, on the same tab / search / page as before                                         |
| 1.5 | Unknown id       | Open `/customers/not-a-real-id`                          | A spinner, then "This customer was not found." with a short hint; no crash                            |
| 1.6 | Other branch     | As a branch staff user, paste the link of another branch's customer | "This customer was not found." — RLS hides it                                               |
| 1.7 | Header buttons   | Click **History**, then **Edit**                         | The customer's full history dialog; the customer form. Saving the form updates the heading and the grid (a new line appears as a tab) |
| 1.8 | No plan          | A customer with no service line                          | "No plans yet — add one from the customer's edit screen."                                         |

## 2. Service-line tabs and the year header

| #   | Scenario         | Steps                                         | Expected result                                                                                                     |
| --- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 2.1 | One line         | Open a one-plan customer                      | No tabs — just the year header and the months table                                                                  |
| 2.2 | Two lines        | Open the two-line customer                    | One tab per line, the first ACTIVE line picked; a red dot on a line with an unpaid month this year, green when only paid months, no dot when nothing is due yet |
| 2.3 | Cancelled line   | A customer with a cancelled line              | Its tab is faded and says "· Cancelled"                                                                              |
| 2.4 | Line header      | Look beside the year                          | Plan name and price on ONE line ("10 Amper · $50.00 / month"): "$20.00 / month", "$60.00 / 3 months", "Custom" for a line with no set price, "· Special price" for a special price |
| 2.5 | Year arrows      | Click ‹ and ›                                 | The table shows the other year at once, with no spinner and no new network read; ‹ is greyed at the line's start year |
| 2.6 | Summary          | Look at the right of the header               | Paid / Unpaid / Skipped (only when > 0) counts and Collected (display currency) for THIS line and year                  |

## 3. The months table

| #    | Scenario            | Steps                                              | Expected result                                                                                                      |
| ---- | ------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Columns             | Open the regular customer                          | 12 rows, Jan to Dec: ☐, Month (a link), Status, Bill, Paid, Still owed, Note, ⋮; rows striped                           |
| 3.2  | Status pills        | Look at the Status column                          | Paid green, Part paid amber, Not paid red, Not due yet grey, Skipped blue, Written off orange, Before the plan started grey |
| 3.3  | This month          | Find the current month                             | Its row is shaded and says "This Month" under the month name                                                        |
| 3.4  | Part paid           | April (paid $5 of $20)                             | Status Part paid; Bill $20.00, Paid $5.00 (green), Still owed $15.00 (red)                                             |
| 3.5  | Unpaid month        | A month with nothing paid                          | Bill shows the line price in grey ($20.00); Paid and Still owed are empty. A line with no set price, or a 3-month line, shows no Bill |
| 3.6  | Non-regular         | The non-regular customer                           | An unpaid month's pill is grey, not red                                                                               |
| 3.7  | Bundle              | A 3-month bill May–Jul                             | May: Bill / Paid / Still owed of the whole bill, Note "Covers May – Jul 2026"; Jun + Jul: Paid pill, no money, Note "Part of the May – Jul 2026 bill" |
| 3.8  | Own currency        | An LBP month                                        | Bill / Paid / Still owed in L.L., never converted                                                                    |
| 3.9  | Skip note           | A month skipped with a note                         | The note is in the Note column                                                                                        |
| 3.10 | Before start        | A month before the line's start                     | Faded row, plain text (no link), no checkbox, no ⋮                                                                    |

## 4. Clicking a month

| #   | Scenario               | Steps                                                       | Expected result                                                                                       |
| --- | ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 4.1 | Oldest unpaid          | Click the oldest unpaid month                               | The collect dialog for that one month ([collect.md](collect.md)); Save → the row reads Paid, the summary updates |
| 4.2 | Out of order           | With May unpaid, click June                                 | Popup: "May … is not paid yet on this plan. Earlier months must be paid first."; nothing opens                                                |
| 4.3 | Paid month             | Click a paid or part-paid month                             | The bill dialog ([bill.md](bill.md)) with Collect the rest (part paid), Send on WhatsApp, ⋮                |
| 4.4 | Written off            | A month written off with $0 collected (still red) → click   | The BILL dialog (Undo write-off in its ⋮), never the collect dialog                                     |
| 4.5 | Skipped                | Click a skipped month with nothing paid after it            | The unskip dialog (§7)                                                                                  |
| 4.6 | Locked skip            | Skip a month, pay the NEXT month, then click the skipped one | The collect dialog (money settles it; the skip can no longer be undone)                               |
| 4.7 | Cancelled line         | A line cancelled in March → click April                     | Popup: the plan is cancelled, the last month that can be billed is March                                       |
| 4.8 | Inactive customer      | A deactivated customer → click a month after the stop       | Popup: the customer is inactive, with the last month that can be billed                                                                         |
| 4.9 | Bundle plan            | The 3-month line → click an unpaid month                    | The collect dialog for the whole 3-month block, labelled "Jan – Mar 2026 · <plan>"                    |

## 5. The ⋮ menu of a month

| #    | Scenario              | Steps                                                       | Expected result                                                                                                     |
| ---- | --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Open month            | ⋮ on the oldest unpaid month                                | Open · Pay · Pay & send on WhatsApp · Collect part · Skip month (+ History as admin)                           |
| 5.2  | Pay (fixed price)     | ⋮ → Pay                                                     | Spinner in the ⋮, then the row reads Paid — no dialog                                                             |
| 5.3  | Pay a bundle          | 3-month line → ⋮ → Pay                                      | Confirm "Record bundle payment?" naming the amount and the months; Record → the block reads Paid                   |
| 5.4  | No set price          | Custom-priced line → ⋮                                     | Pay says "No set price — type the amount" and opens the collect dialog; no Collect part                              |
| 5.5  | Pay and send          | ⋮ → Pay & send on WhatsApp                                | Saved, then the "Open WhatsApp" confirm; its button opens the receipt                                                |
| 5.6  | No phone              | The no-phone customer → ⋮                                   | "Pay & send on WhatsApp" is greyed with "No phone number for this customer"                                       |
| 5.7  | Out of order          | ⋮ on a later unpaid month                                   | Only Open and Skip (no pay rows)                                                                                     |
| 5.8  | Part paid             | ⋮ on April                                                  | Open · View bill · Collect the rest · Void this month (+ History)                                                    |
| 5.9  | Written off           | ⋮ on a written-off part-paid month                          | View bill, no Collect the rest                                                                                       |
| 5.10 | History (admin)       | ⋮ → History on a paid month, a skipped month, and a month whose bill was voided | The record history dialog: the bill + its payments; the skip; the voided bill's trail (found by its id). As staff, no History row |
| 5.11 | Void newest first     | Jan–Mar paid → ⋮ on Feb → Void this month                   | Popup: "March … is paid on this plan. Newer months must be voided first."; nothing is voided                                                                           |
| 5.12 | Void the newest       | ⋮ on March → Void this month                                | "Void this month?" with a reason box; when its payment also paid another bill, the red warning NAMES that bill ([../shared-handover-void.md](../shared-handover-void.md)); Void → March reads Not paid again |
| 5.13 | Void fails            | Network off → Void this month → Void                        | The red reason shows INSIDE the void dialog; the dialog stays open                                                    |
| 5.14 | Keyboard              | Tab into the table                                          | The month link, checkbox and ⋮ of each row get the blue focus outline; Enter on the link opens the month |

## 6. Ticking several months

| #    | Scenario             | Steps                                                         | Expected result                                                                                    |
| ---- | -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 6.1  | Tick                 | Tick May, Jun, Jul                                            | A blue bar above the table: ✕, "3 selected", Collect · Pay & send on WhatsApp · Skip month          |
| 6.2  | Collect several      | → Collect                                                     | ONE collect dialog for all three; Save → the bar goes, the rows read Paid                           |
| 6.3  | Out of order         | With May unpaid, tick only Jun + Jul → Collect                | Popup: May must be paid first                                                                        |
| 6.4  | Bundle moves whole   | 3-month line: tick one month of a block                       | Every month of that block is ticked together; untick one → all unticked                             |
| 6.5  | Tick all             | The header checkbox                                           | Every month except before-start ones is ticked; the bar only offers actions that fit                 |
| 6.6  | Typed amounts        | Custom-priced line: tick two months → Collect                 | Popup: months with no set price are collected one at a time                                         |
| 6.7  | Part paid included   | Tick April (part paid) + May → Collect                        | The dialog holds April's rest and May                                                               |
| 6.8  | Skip several         | Tick two unpaid months → Skip month                           | The skip dialog: "2 selected months will not be counted as unpaid…" with a note box; Skip → both Skipped, bar goes |
| 6.9  | Unskip several       | Tick two skipped months → Unskip month                        | Unskip dialog for 2; confirm → both back to Not paid                                                 |
| 6.10 | Clear                | ✕ in the bar                                                  | Nothing ticked; the bar goes                                                                         |
| 6.11 | Change year          | Tick a month, then change the year                            | The ticks are cleared                                                                                |
| 6.12 | No phone             | The no-phone customer, tick a month                           | No "Pay & send on WhatsApp" in the bar                                                               |

## 6b. Grid view

| #     | Scenario          | Steps                                                    | Expected result                                                                                                   |
| ----- | ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 6b.1  | Switch            | Top right of the year header: click the grid icon, then the list icon | The months show as coloured tiles, then as the table again; the pressed icon is highlighted; each has a tooltip ("Show as a list" / "Show as a grid") |
| 6b.2  | Starts as grid    | Open another customer                                    | The page opens in the grid view                                                                                    |
| 6b.3  | Same tabs + year  | Grid view → change the year and the line tab             | Still the grid view                                                                                                |
| 6b.4  | Layout            | Wide window, then narrow it                              | 6 tiles a row on a wide screen, 4 on a narrow one; the tiles are taller than the phone's                           |
| 6b.5  | Colours           | The regular customer, then the non-regular one           | Paid green, unpaid red, future / before start light grey, skipped dark grey; this month unpaid = pale red with a red border and "THIS MONTH"; part paid = amber border + "PARTIAL"; non-regular paid yellow, unpaid light grey |
| 6b.6  | Bundle            | A 3-month bill May–Jul                                   | One joined pill: May "PAID", Jun + Jul "INCL."; at a row break a small › / ‹ marks the join                       |
| 6b.7  | Click + ⋮         | Repeat §4 and §5 on tiles                                | The same results as in the list (same rows in each ⋮)                                                              |
| 6b.8  | Checkbox          | Look at the tiles                                        | Every month except before-start ones has a checkbox (top left) and a ⋮ (top right); clicking the tile itself still opens the month |
| 6b.9  | Check months      | Check May and Jun                                        | A blue bar appears above the grid: ✕, "2 selected", and only the actions that fit (Collect · Pay & send on WhatsApp · Skip month …); the checked tiles get a blue border; Collect → Save → the checks clear and the bar goes |
| 6b.10 | Keep the picks    | Pick months in the grid, switch to the list              | The same months are ticked in the table                                                                            |
| 6b.11 | Keyboard          | Tab through the tiles                                    | Each tile, its checkbox and its ⋮ get the blue focus outline; Space checks the box; a screen reader reads "Apr 2026: Part paid" and "Pick Apr 2026"                       |

## 7. Skip and unskip

| #   | Scenario          | Steps                                                         | Expected result                                                                              |
| --- | ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 7.1 | Skip with a note  | ⋮ → Skip month, type "Travelling", Skip                  | Status "Skipped", the note in the Note column; the summary shows Skipped 1                                       |
| 7.2 | Unskip shows note | Click that skipped month                                      | "Unskip this month?" dialog showing the note "Travelling"; Unskip → Not paid again                           |
| 7.3 | Unskip refused    | Skip Jan, pay Feb (so Jan is locked), then Unskip from the bar | Not offered: Unskip is missing for a locked skip                                            |
| 7.4 | Error             | Network off → Skip                                            | Red message inside the dialog; it stays open; typing clears it                                |

## 8. The `?quickPay=1` link

| #   | Scenario                 | Steps                                                                    | Expected result                                                                         |
| --- | ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 8.1 | From the list            | A customer with TWO custom-priced lines due → Customers → ⋮ → Quick pay unpaid plans | This page opens and the collect dialog for this month of the first active line opens by itself |
| 8.2 | One time only            | Close it, then reload the page                                           | `?quickPay=1` is gone from the address; nothing reopens                                 |
| 8.3 | Older month open         | Open `/customers/<id>?quickPay=1` for a customer with an older unpaid month | Popup: pay that month first; no dialog                                               |
| 8.4 | Skipped this month       | Same link when this month is skipped                                     | Popup: a skipped month cannot be paid                                                   |

## 9. The unpaid banner

| #   | Scenario       | Steps                                                  | Expected result                                                                      |
| --- | -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 9.1 | Shown          | Regular customer, active line, this month unpaid        | Red bar under the table: "<Month Year> is not paid yet." with **Collect**              |
| 9.2 | Collect        | Click Collect                                           | Pays this month in one go (fixed price) or opens the collect dialog (no set price)   |
| 9.3 | Hidden         | Non-regular customer, a cancelled line, or another year | No bar                                                                               |

## 10. Phone regression (the phone panel now runs the same Shared code)

Run on a phone dev build — JS-only change, the fingerprint is unchanged.

| #    | Scenario            | Steps                                                            | Expected result                                                                       |
| ---- | ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 10.1 | Grid looks the same | Open the regular customer                                        | Same colours, PARTIAL ring, joined bundle pills, wrap chevrons, line pills with dots  |
| 10.2 | Tap rules           | Repeat §4.1–4.8 by tapping                                        | Same results as the web                                                                |
| 10.3 | 3-dot menu          | Repeat §5.1–5.12                                                  | Same rows, same order, same popups                                                     |
| 10.4 | Long-press select   | Long-press a month, tap more, use the toolbar; Android Back       | Same as §6; Back clears the selection instead of leaving                               |
| 10.5 | Quick pay link      | Customer list → quick pay a two-typed-lines customer              | The detail opens and the collect sheet opens after the screen slides in                |
| 10.6 | Void error inside   | Network off → Void this month → Void                              | The red reason now shows INSIDE the void dialog (before, it showed behind it)          |
| 10.7 | Banner text         | This month unpaid                                                 | "<Month Year> Unpaid" + "Amount due" — the English-only "N days into the month" is gone |
| 10.8 | Selection elsewhere | Long-press on Customers, Plans, Sales, Money received, Wallet     | Selection still works (the hook moved to Shared, unchanged)                            |

## 11. Page layout and the ⋮ beside Edit

| #    | Scenario            | Steps                                                     | Expected result                                                                                           |
| ---- | ------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 11.1 | Order               | Open a customer on a wide screen                          | Months on top; below them **Details** (left, narrow) beside **Debts** (right, wide); **Sales** under both |
| 11.2 | Narrow window       | Make the window narrow                                    | Details, Debts and Sales stack one under the other; nothing scrolls sideways                              |
| 11.3 | Not admin           | Sign in as a plain user                                   | No ⋮ beside Edit                                                                                          |
| 11.4 | Deactivate          | Admin → ⋮ → Deactivate → confirm                          | Status in Details turns orange "Inactive"; the ⋮ now says **Activate**                                    |
| 11.5 | Activate            | ⋮ → Activate → confirm                                    | Status green "Active" again                                                                               |
| 11.6 | Delete, no history  | Admin, a customer with no payments → ⋮ → Delete → confirm | Back on the Customers list; the customer is gone                                                          |
| 11.7 | Delete with history | Same on a customer who has payments                       | Stays on the page; the customer is kept as cancelled (inactive)                                           |
| 11.8 | Same on the list    | Customers → ⋮ → Deactivate / Delete, and bulk Delete      | Same popups and results as before (both doors run one hook now)                                           |

## 12. Details panel

| #    | Scenario    | Steps                                             | Expected result                                                                                |
| ---- | ----------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 12.1 | Rows        | Customer with phone, branch, address, area, notes | Each shows with its icon; empty fields are not listed                                          |
| 12.2 | Map link    | Click **Open in Maps**                            | The saved link opens in a NEW tab; a link saved without `https://` still opens                 |
| 12.3 | No map link | Customer without a location                       | No "Location on map" row                                                                       |
| 12.4 | Portal on   | Portal switched on for the customer               | "Customer portal link" row with the link and **Copy link**                                     |
| 12.5 | Copy        | Click Copy link, paste it in a new tab            | Button reads **Copied** in green for 2 s; the pasted link opens the portal for this customer   |
| 12.6 | Portal off  | Portal switched off                               | No portal row at all                                                                           |
| 12.7 | After edit  | Edit → change the address → Save                  | Details shows the new address without a reload                                                 |

## 13. Debts panel

| #     | Scenario              | Steps                                                                               | Expected result                                                                                                       |
| ----- | --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 13.1  | What is listed        | Customer with a part-paid month, a custom debt, a pay-later sale, and unpaid months | The part-paid month, the custom debt and the sale are rows; plain unpaid months are NOT (the months above show them) |
| 13.2  | Columns               | Look at a row                                                                       | Bill (link), Type pill, Due, Status chips, Still owed (own currency + "≈" display currency)                          |
| 13.3  | Chips                 | The 10-days-late part-paid custom debt                                              | Red "**10 days late**" (plural — not "10 day late") and amber "Paid x of y"; a clean on-time row has no chip          |
| 13.4  | Total                 | Header                                                                              | "Owed: $…" = the sum of the rows, each at its own rate                                                               |
| 13.5  | Open a bill           | Click a bill name                                                                   | The bill dialog opens with its payments; History (admin), Write off, Collect the rest                                 |
| 13.6  | Collect from the bill | In the bill dialog → Collect the rest                                               | The bill closes and the collect dialog opens for that bill with the right amount; Save → the row's balance drops      |
| 13.7  | Collect from ⋮        | Row ⋮ → Collect                                                                     | Collect dialog for that one bill                                                                                      |
| 13.8  | Collect all           | Header → **Collect all**                                                            | Collect dialog with every listed bill, oldest first                                                                   |
| 13.9  | Write off             | Row ⋮ → Write off → confirm                                                         | The row leaves "Owed now" and appears under "Written off", greyed with an orange chip                                 |
| 13.10 | Undo                  | Written off tab → ⋮ → Undo write-off → confirm                                      | It moves back to "Owed now"                                                                                           |
| 13.11 | Write off all         | Header ⋮ → Write off all → confirm                                                  | Every billed row moves to "Written off"; the confirm names the total and the count                                    |
| 13.12 | Remove custom debt    | Unpaid custom debt → ⋮ → Remove → confirm                                           | The row is gone                                                                                                       |
| 13.13 | Remove a paid one     | Part-paid custom debt → ⋮ → Remove → confirm                                        | Refused; the reason shows in the red bar at the top of the months panel; the row stays                               |
| 13.14 | No Edit yet           | Custom debt ⋮                                                                       | No Edit row (the custom-debt form comes in F3)                                                                        |
| 13.15 | Empty                 | A customer who owes nothing on bills                                                | "No open bills. Unpaid months are shown above."; Written off tab: "Nothing written off for this customer."            |
| 13.16 | Months follow         | Collect a part-paid month from this panel                                           | The month tile above turns full green (every panel re-reads after a payment)                                          |

## 14. Sales panel

| #    | Scenario         | Steps                                                       | Expected result                                                                                                                       |
| ---- | ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 14.1 | Latest 10        | Customer with 12 sales                                      | 10 rows, newest first; header says "Showing the latest 10 sales" with a **Show all** button → the customer's sales page (web/sales.md §6) |
| 14.2 | Columns          | Look at a row                                               | Receipt ID (#ABC123), Sold at, Items, Total, Still owed (blank when paid or voided), Status chips                                      |
| 14.3 | Status chips     | Paid / part-paid / unpaid / voided / written off / no items | Paid in full (green) · Part paid (amber) · Not paid (red) · Voided (red, reason on hover) · Written off (orange) · No items (violet) |
| 14.4 | Voided row       | A voided sale                                               | Greyed row; no Collect in its ⋮                                                                                                       |
| 14.5 | Collect the rest | Pay-later sale → ⋮ → Collect $x                             | Collect dialog for that sale's bill; Save → Still owed drops and the Debts panel follows                                              |
| 14.6 | The receipt      | Click the receipt ID (or ⋮ → View receipt)                  | The sale receipt (web/sales.md §3); its ⋮ rows are View receipt, Collect, Send invoice, (History), Void sale                          |
| 14.7 | History          | Admin → ⋮ → History                                         | The sale's trail with its bill and payments; a plain user has no History row                                                          |
| 14.8 | Empty            | Customer with no sales                                      | "No sales for this customer yet."                                                                                                     |

## 15. Phone regression (the phone debts / sales panels now run the same Shared code)

Run on a phone dev build — JS-only change, the fingerprint is unchanged.

| #    | Scenario           | Steps                                                       | Expected result                                                                           |
| ---- | ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 15.1 | Debts panel        | Customer detail → Debts                                     | Same rows, total, chips and ⋮ rows (Collect / Undo / Edit / Write off / Remove) as before |
| 15.2 | Plural text        | A bill 3 days late; a debt history "settled 2 days late"    | "3 days late" — no longer "3 day late"                                                    |
| 15.3 | Remove custom debt | ⋮ → Remove                                                  | Same popup; the row goes                                                                  |
| 15.4 | Sales panel        | Customer detail → Sales; long-press a sale; pull to refresh | 5 cards + Show all; selection clears when the list re-reads                               |
| 15.5 | Sale collect       | Pay-later sale → ⋮                                          | "Collect" row only when the sale owes, has a customer, and is not voided                  |
| 15.6 | Open location      | Details → Open in Maps                                      | The Maps app opens the saved link (also one saved without https://)                       |
