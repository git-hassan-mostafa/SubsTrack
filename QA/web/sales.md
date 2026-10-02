# Web — Sales — QA Scenarios

The web **Sales** page, the **sale receipt** dialog, void and bulk void, the WhatsApp invoice, and one customer's **full sales page**. The money rules are the phone's — [../sales.md](../sales.md) (§10 lists what F1 changed on the phone too) — and the payments list inside the receipt is the bill dialog's, covered in [bill.md](bill.md).

**Reference code:**

- Pages: [SalesPage.tsx](Web/src/modules/transaction/sales/SalesPage.tsx), [CustomerSalesPage.tsx](Web/src/modules/transaction/sales/CustomerSalesPage.tsx), the shared body [SalesTable.tsx](Web/src/modules/transaction/sales/SalesTable.tsx) + [SalesFilters.tsx](Web/src/modules/transaction/sales/SalesFilters.tsx), store [salesTable.ts](Web/src/state/salesTable.ts)
- Doors: [useSaleDoors.tsx](Web/src/modules/transaction/sales/useSaleDoors.tsx), [SaleReceiptDialog.tsx](Web/src/modules/transaction/sales/SaleReceiptDialog.tsx), [SaleItemsTable.tsx](Web/src/modules/transaction/sales/SaleItemsTable.tsx), [VoidSalesDialog.tsx](Web/src/modules/transaction/sales/VoidSalesDialog.tsx), [useSendSalesInvoice.ts](Web/src/modules/invoicing/useSendSalesInvoice.ts)
- Shared with the phone: [saleFilters.ts](Shared/src/modules/transaction/sales/utils/saleFilters.ts), [saleView.ts](Shared/src/modules/transaction/sales/utils/saleView.ts) (`saleMenuItems`, `saleVoidTarget`, `saleInfoRows`), [useVoidSales.ts](Shared/src/modules/transaction/sales/hooks/useVoidSales.ts), `SaleService.getSalePage`, `ISaleRepository.findPage` (both impls), `saleRecipientRows` (unit tests: `tests/suites/salesPage.test.ts` TC-SG-*)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project (check the URL first — Void and Collect WRITE money). Have: a paid sale, a part-paid sale, an unpaid sale, an LBP sale, a walk-in sale, a sale with a typed total (a discount), a sale with no items, a sale with a service line, one voided sale, sales by two staff, and (for §2.6) a branch user.

---

## 1. The table

| #    | Scenario       | Steps                                            | Expected result                                                                                                                                    |
| ---- | -------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Opens          | Left nav → Sales                                 | Title "Sales"; newest sale first; columns Receipt ID, Sold at, Customer, Items, (Branch), Recorded by, Total, Still owed, Status, ⋮                 |
| 1.2  | Receipt number | Look at the first column                         | "#ABC123" — the last 6 characters of the sale id, upper case, as a link                                                                           |
| 1.3  | Customer link  | Click a customer's name                          | Opens that customer's page (`/customers/:id`); Ctrl+click opens a new tab                                                                          |
| 1.4  | Walk-in        | Look at the walk-in sale                         | Customer reads "Walk-in / no customer" (no link)                                                                                                   |
| 1.5  | Own currency   | Look at the LBP sale                             | Total in L.L. with "≈ $…" under it at the sale's frozen rate                                                                                       |
| 1.6  | Still owed     | Look at the part-paid and the paid sale          | Part-paid: the rest in the sale's currency + amber "Part paid"; paid: empty + green "Paid in full"; unpaid: red "Not paid"                          |
| 1.7  | Chips          | Look at the no-items sale and a written-off one  | Violet "No items"; orange "Written off" beside the pay pill                                                                                        |
| 1.8  | Paging         | More than 25 sales → page 2, then 50 per page    | Rows change, the count is right, no sale shows twice across pages                                                                                  |
| 1.9  | Branch column  | Tenant with 2+ active branches                   | A Branch column; a sale with no branch reads "Unassigned"                                                                                          |

## 2. Filters, search and the total

| #   | Scenario        | Steps                                                       | Expected result                                                                                                                       |
| --- | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Total bar       | Open the page                                               | "Total sold (voided sales not counted)" = every live sale in the filter, in the display currency, each at its own frozen rate           |
| 2.2 | Product         | Product → Router                                            | Only sales with a live Router line; the total follows                                                                                 |
| 2.3 | Dates           | From = the 1st of last month, To = its last day; then clear From | Only sales sold in that range (To is included); clearing a date widens again                                                     |
| 2.4 | Status          | Status → Voided only; then Live and voided                  | Only the voided sale and **no total bar**; then every sale with the voided one greyed and struck — and the total does **not** grow     |
| 2.5 | Search          | Type part of an item name; then a customer's name; then a receipt number ("ABC123" or "#abc1") | Matches on the item summary, the customer name, and the receipt number; walk-in sales still match on their items |
| 2.6 | Branch scope    | Header branch → Branch A; log in as a branch user           | Only Branch A's sales, page 1 again; a branch user sees only their branch                                                             |
| 2.7 | Clear filters   | With filters set and no match → Clear filters               | Every filter back to default (live sales, all dates); the header branch is kept                                                       |
| 2.8 | Over 1000 sales | A test tenant with 1000+ live sales in the filter           | The total counts every one of them (it reads past the 1000-row cap, gotcha #175)                                                     |

## 3. The receipt dialog

| #    | Scenario          | Steps                                                      | Expected result                                                                                                                         |
| ---- | ----------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Opens             | Click a receipt number; or ⋮ → View receipt                | "SALE RECEIPT · #ABC123 · For Ali"; the status panel (still owed / paid in full + bar); detail rows Sold at, Receipt ID, Recorded by, Notes |
| 3.2  | Items             | Open a sale with a product ×2 and a service                | One row per line: the product shows its quantity and unit price; the service has a tool icon and no quantity                            |
| 3.3  | Typed total       | Open the discounted sale                                   | Under the items: "Items add up to $X — this total is set manually"; the status panel uses the typed total                               |
| 3.4  | No items          | Open the no-items sale                                     | "No products or services on this sale. It was recorded as a total of $X." — no items table                                              |
| 3.5  | Payments          | Open the part-paid sale                                    | The payments table (bill.md §3): date link → payment details, ⋮ send / correct / void                                                    |
| 3.6  | Collect the rest  | Part-paid sale → "Collect the rest $X"                      | The receipt closes, the Collect dialog opens on that one bill; save → the table re-reads, Still owed drops                              |
| 3.7  | Walk-in           | Open the walk-in sale                                      | Subtitle "Walk-in / no customer"; no Collect button; Send is disabled with "Walk-in sale — no customer to send to"                       |
| 3.8  | History           | As admin, ⋮ → History                                       | The sale's and its bill's audit entries; as a non-admin the ⋮ has no History                                                             |
| 3.9  | Voided sale       | Open the voided sale                                       | Red "Voided" panel, the void reason in the detail rows, no Send, no Collect, no Void                                                     |
| 3.10 | Correct a payment | In the receipt, ⋮ on a payment → Correct amount → save     | The receipt's payments update; closing it, the table row shows the new Still owed                                                       |

## 4. Void and bulk void

| #   | Scenario            | Steps                                                       | Expected result                                                                                                                         |
| --- | ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Void one            | ⋮ → Void sale (or in the receipt, ⋮ → Void sale)            | "Void this sale" confirm saying the money collected on it is voided too; Reason (optional); red Void sale                                |
| 4.2 | Shared payment      | Void a sale whose payment also paid a month                 | The confirm waits for the check, then names the month that becomes unpaid again (gotcha #125)                                           |
| 4.3 | Done                | Confirm                                                     | The dialog (and the receipt) close; the row leaves the live list; the total drops; stock comes back on the product                        |
| 4.4 | Keep it visible     | Status → Live and voided, then void a sale                  | The row stays, greyed with the red Voided pill                                                                                          |
| 4.5 | Bulk void           | Tick 3 sales (one already voided) → Void sale                | "Void 2 sales" — the voided one is left out; confirm → both go                                                                          |
| 4.6 | Part failed         | Bulk void where one sale fails on the server                | The confirm closes, an info notice "Voided 1 · 1 failed." shows above the table                                                         |
| 4.7 | Everything failed   | Void while the server refuses every one                     | The confirm stays open with the reason in it                                                                                            |

## 5. WhatsApp invoice

| #   | Scenario           | Steps                                                          | Expected result                                                                                                  |
| --- | ------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 5.1 | One sale           | ⋮ → Send invoice on WhatsApp (or the receipt's button)         | A new tab opens wa.me with the receipt text for that sale                                                        |
| 5.2 | No phone           | A customer with no phone → ⋮                                   | The row is disabled with "No phone number for this customer"                                                     |
| 5.3 | Several, one customer | Tick 2 sales of Ali → Send invoice on WhatsApp              | ONE message listing both sales                                                                                   |
| 5.4 | Mixed customers    | Tick sales of Ali and Bob → Send                               | "Not available — One invoice goes to one number…" with a Close button; nothing opens                             |
| 5.5 | Blocked tab        | Block pop-ups, then send                                       | The "Open WhatsApp" confirm appears; its button opens the chat                                                   |

## 6. A customer's full sales page

| #   | Scenario     | Steps                                                                 | Expected result                                                                                                  |
| --- | ------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 6.1 | Show all     | Customer page of someone with 11+ sales → Sales panel → Show all      | `/customers/:id/sales`; heading = the customer's name; ← goes back to the customer page; Customers stays selected in the nav |
| 6.2 | Columns      | Look at the table                                                     | No Customer column; everything else as §1                                                                        |
| 6.3 | Every branch | Header branch → Branch A, open the page for a customer with sales in two branches | Both branches' sales show (this page ignores the header branch, like the phone)                     |
| 6.4 | Filters      | Status → Live and voided; search an item                              | Works as §2, only inside this customer; the total is this customer's                                             |
| 6.5 | Another customer | Open customer B's sales page right after customer A's             | Only B's sales — never A's rows for a moment                                                                     |
| 6.6 | Direct link  | Paste `/customers/<id>/sales` into a new tab                          | The page loads with the name and the sales                                                                       |

## 7. A sale opened from elsewhere

| #   | Scenario                 | Steps                                                          | Expected result                                                                 |
| --- | ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 7.1 | Money received           | A payment that paid one sale → click its Paid for link         | The **sale receipt** opens (not the plain bill dialog)                          |
| 7.2 | Payment details          | Money received → open a payment → click its sale bill row      | The sale receipt opens                                                          |
| 7.3 | Customer page — debts    | Debts panel → click a sale debt's name                         | The sale receipt opens; voiding it there re-reads the debts panel               |
| 7.4 | Customer page — sales    | Sales panel → click a receipt number; ⋮ on a row               | The receipt; the ⋮ has View receipt, Collect, Send invoice, (History), Void sale |
| 7.5 | Quick action             | Header Collect money → pay a sale → open Sales                 | The paid amount shows without pressing Refresh                                  |

## 8. Fresh data — no re-read on open

Open DevTools → Network and filter on `sales`: each check below says whether the table reads again. Store: [salesTable.ts](Web/src/state/salesTable.ts), [useOpenPagedTable.ts](Web/src/shared/table/useOpenPagedTable.ts), [useMoneyTablesFreshness.ts](Web/src/state/useMoneyTablesFreshness.ts).

| #   | Scenario               | Steps                                                                                                   | Expected result                                                                                 |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 8.1 | Open again             | Open Sales, go to Customers, come back                                                                  | No new sales read; the same page, search and filters are there                                  |
| 8.2 | Collect here           | ⋮ → Collect on a part-paid sale → Save                                                                  | The table reads once by itself; Still owed and the chips update                                 |
| 8.3 | Void here              | Void a sale; then bulk void two                                                                         | One read each time; the row is muted and the total drops                                        |
| 8.4 | Payment in the receipt | Open a receipt → void one of its payments                                                               | One read; the sale is owed again                                                                |
| 8.5 | Money elsewhere        | Open Sales → a customer page: collect a sale debt (then repeat with: void a payment on a sale bill, write off a sale) → open Sales | One read each time; the row shows the new paid amount                  |
| 8.6 | Customer renamed       | Open Sales → rename a customer who has sales → open Sales                                               | One read; the Customer column shows the new name                                                |
| 8.7 | Customer's sales page | `/customers/:id/sales` → open a receipt → void a payment                                                | The page reads again by itself                                                                  |
| 8.8 | Another device         | Record a sale on the phone → open Sales on the web (already opened once)                                 | The sale is not there until you click Refresh                                                   |
