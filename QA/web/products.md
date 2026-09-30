# Web — Products Page — QA Scenarios

The **Products** admin page on the desktop web app, with its stock dialog and the **Batch Restock** quick action. It is built on the shared web table, so first run the table checks in [branches.md](branches.md) §1, §2, §5.8, §6, §7 and §9 on this page. The product and stock rules are the phone's: [../products.md](../products.md).

**Reference code:**

- Page: [ProductsPage.tsx](Web/src/modules/admin/products/ProductsPage.tsx), [ProductFormDialog.tsx](Web/src/modules/admin/products/ProductFormDialog.tsx), [ProductStockDialog.tsx](Web/src/modules/admin/products/ProductStockDialog.tsx), [BatchRestockDialog.tsx](Web/src/modules/admin/products/BatchRestockDialog.tsx)
- Quick action: [QuickActions.tsx](Web/src/app/layout/QuickActions.tsx), [QuickActionDialogs.tsx](Web/src/app/layout/QuickActionDialogs.tsx)
- Page state: [productsTable.ts](Web/src/state/productsTable.ts)
- Server read: `findPage` in [ProductRepository.ts](Shared/src/modules/admin/products/repository/ProductRepository.ts) (phone twin: [ProductRepository.offline.ts](SubsTrack/src/modules/admin/products/repository/ProductRepository.offline.ts)), stock via `getProductPage` in [ProductService.ts](Shared/src/modules/admin/products/services/ProductService.ts)
- Form rules shared with the phone: [useStockEntryForm.ts](Shared/src/modules/admin/products/hooks/useStockEntryForm.ts), [useBatchRestockForm.ts](Shared/src/modules/admin/products/hooks/useBatchRestockForm.ts), [stockCost.ts](Shared/src/modules/admin/products/utils/stockCost.ts) (unit tests: `tests/suites/stockCost.test.ts`)

Run: `cd Web && npm run dev`, with `Web/.env.local` pointing at the **test** project. Use a tenant with 2+ active branches and at least one non-USD currency.

---

## 1. The list

| #   | Scenario             | Steps                                          | Expected result                                                                                                  |
| --- | -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1.1 | Columns              | Open Admin → Products                          | Name, Description, Branch, Price, Cost, Stock, Status, ⋮                                                         |
| 1.2 | Price and cost       | A product priced in LBP, display currency USD  | Price in LBP with "≈ $…" under it; Cost empty when no cost price was set                                         |
| 1.3 | Stock pill           | Products with 5, 0 and −2 on hand              | Green "5 in stock" / red "Out of stock" / red "Short by 2" — the same words as the phone card                    |
| 1.4 | Stock is live        | Sell 2 units on the phone, sync, press Refresh | The pill drops by 2 (stock is the sum of movements, never a stored number)                                       |
| 1.5 | Header branch        | Header Branch → Beirut                         | Beirut's products plus the shared ones; back to page 1                                                           |
| 1.6 | Status filter        | Status → Inactive                              | Only products hidden by a delete (they had been sold)                                                            |
| 1.7 | Empty tenant         | Tenant with no products                        | "No products yet", the phone's hint, and an "Add product" button                                                 |

## 2. Add and edit

| #   | Scenario                | Steps                                                         | Expected result                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2.1 | Add with stock          | Add product → Router, 50 USD, cost 30 USD, starting stock 10  | Row shows "10 in stock"; Expenses for today gain $300 (the opening stock is priced at the cost)   |
| 2.2 | Add without stock       | Starting stock empty                                          | "Out of stock"; no expense                                                                        |
| 2.3 | Price required / zero   | Save with an empty price, then 0                              | Red banner in the dialog each time; Save is never greyed out                                      |
| 2.4 | Name taken              | Same name in the same branch                                  | Red banner: the name already exists                                                               |
| 2.5 | Edit shows stock        | Edit a product                                                | No starting-stock field; an "In stock" box with the count and an "Adjust Stock" button            |
| 2.6 | Inactive product        | Edit an inactive product                                      | The stock box has no "Adjust Stock" button                                                        |
| 2.7 | Stock from the form     | Edit → Adjust Stock → add 3 → Add Stock                       | The stock dialog closes; the form (still open) now shows the new count                           |
| 2.8 | Discard guard           | Run [app-shell.md](app-shell.md) §5 on this form              | As written there                                                                                  |

## 3. Stock dialog

| #    | Scenario                   | Steps                                                                 | Expected result                                                                                                       |
| ---- | -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Open                       | ⋮ → Adjust Stock                                                      | A wide dialog: product name under the title, "In stock" count, then Quantity, Cost per unit (starts at the product's cost), Total cost and Note on ONE row, then the last 20 stock entries as a table |
| 3.2  | Add                        | Quantity 4 → Add Stock                                                | Dialog closes; the row's pill goes up by 4; the entry is at the top of the history next time                          |
| 3.3  | Bad quantity               | Quantity empty → Add Stock                                            | Red banner "Enter a whole number greater than 0"                                                                      |
| 3.4  | Unit → total               | Quantity 3, cost per unit 10                                          | Total cost shows 30; the line under it says it adds $30.00 to Expenses                                                |
| 3.5  | Total → unit               | Quantity 3, type total 100                                            | Cost per unit 33.33333333 (saved expense is exactly 100, not 99.99)                                                   |
| 3.6  | Total stays anchored       | After 3.5, change quantity to 4                                       | Total stays 100; cost per unit becomes 25                                                                             |
| 3.7  | No cost                    | Clear both cost fields, add stock                                     | Entry saved with no cost; Expenses unchanged                                                                          |
| 3.8  | Edit entry                 | ⋮ on a restock entry → Edit entry, change 4 → 2, Save Changes         | Blue "Editing this entry" box and the row highlighted in the table while editing; the count drops by 2; the dialog stays open on "record a new change"     |
| 3.9  | Stop editing               | While editing, close the blue box                                     | Fields go back to empty; nothing saved                                                                                |
| 3.10 | Goes negative              | Edit an old entry so stock would fall below 0                         | Yellow note "Stock will go to −N. You can still save." — saving works                                                 |
| 3.11 | Revert entry               | ⋮ → Revert entry → Revert                                             | Confirm names the entry ("Stock added +4"); the row greys out, its type and quantity struck through with a "Reversed" chip and no cost; the count corrects |
| 3.12 | Sale entries               | A "Sold" entry                                                        | No ⋮ menu (a sale's stock is fixed on the sale)                                                                       |
| 3.13 | Reversed entry menu        | ⋮ on a reversed entry                                                 | History only                                                                                                          |
| 3.14 | Entry history              | ⋮ → History                                                           | The record-history dialog for that stock entry                                                                        |
| 3.14b | History table             | Look at the stock history                                             | Same look as the page tables: columns Date, Type, Quantity (green + / red −), Cost, Note, By, Actions (⋮)             |
| 3.15 | Row follows the dialog     | Add, edit or revert an entry, then close the dialog                   | The row's stock pill shows the new count with NO new products request (DevTools Network)                            |

## 4. Batch Restock (quick action)

| #   | Scenario                  | Steps                                                                          | Expected result                                                                                           |
| --- | ------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 4.1 | Who sees it               | Sign in as admin / as staff                                                    | Admin: a box-with-arrow icon in the header (tooltip "Batch Restock") on every page. Staff: no icon        |
| 4.2 | From the page             | Products page → "Restock several"                                              | The same dialog                                                                                           |
| 4.3 | List                      | Open it                                                                        | Every ACTIVE product with its stock; inactive ones are not listed                                         |
| 4.4 | Pick                      | Type 5 for Router                                                              | Row highlights; New stock shows old + 5; a cost field appears, filled with the product's cost             |
| 4.5 | First pick sets currency  | Nothing picked, delivery currency USD, pick a product whose cost is in LBP     | Delivery currency switches to LBP and the cost is in LBP                                                  |
| 4.6 | Change currency           | Switch delivery currency to USD                                                | Every picked row's cost is re-priced from its catalog cost (never the typed number converted)             |
| 4.7 | Summary                   | Pick 2 products (5 and 3 units, costs 10 and 20)                               | "2 products selected", "+8", Total cost 110                                                               |
| 4.8 | Nothing picked            | Add Stock with no quantity                                                     | Red banner "Type a quantity for at least one product."                                                    |
| 4.9 | Save                      | Add Stock                                                                      | Dialog closes; if the Products page is open, its stock pills update; each product has its own entry       |
| 4.10 | Search                   | Type part of a name                                                            | Only matching rows; picked rows keep their numbers when the search is cleared                             |
| 4.11 | Discard guard            | Pick a product, press Esc                                                      | Asks to discard                                                                                           |
