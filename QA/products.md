# Products — QA Scenarios

Covers the Products catalog: a list of one-off sellable items (not subscriptions) that staff can reference when recording sales. Products are admin-only, tier-gated, and scoped per tenant. They share the same branch semantics as plans (`branch_id IS NULL` = SHARED, visible to every branch).

**Reference code:**
- Screen: [ProductListScreen.tsx](SubsTrack/src/modules/products/screens/ProductListScreen.tsx)
- Service: [ProductService.ts](SubsTrack/src/modules/products/services/ProductService.ts)
- Repository: [ProductRepository.ts](SubsTrack/src/modules/products/repository/ProductRepository.ts)
- Form sheet: [ProductFormSheet.tsx](SubsTrack/src/modules/products/components/ProductFormSheet.tsx)
- Card: [ProductCard.tsx](SubsTrack/src/modules/products/components/ProductCard.tsx)
- Route: [admin/products.tsx](SubsTrack/app/(app)/(tabs)/admin/products.tsx)
- Tier enforcement: [TierService.ts](SubsTrack/src/modules/subscription/services/TierService.ts)

---

## 0. Critical invariants

1. **Products are never hard-deleted when referenced by a sale line.** `ProductService.deleteProduct()` checks `countReferences(id)` — the count of `sale_items` rows (sale lines) using the product. If any sale line references it, it sets `active = false` (soft-delete). Hard-delete only when no sale line exists.
2. **`branch_id IS NULL` means SHARED** — visible to every branch, same as plans.
3. **Tier-gated creation.** `ProductService.createProduct()` calls `tierService.assertCanCreate(tier, usage, 'products')` after validation. Free tier: max 5 products. Pro / Business: unlimited.
4. **`null currency_id` means USD** throughout — same rule as payments and plans.
5. **Admin-only.** The Products screen and all mutations are inaccessible to the `user` role.
6. **Stock is a ledger sum, never a stored counter.** `Product.stockOnHand = SUM(stock_movements.quantity_delta)` over non-voided rows. Rows are never deleted, and voiding a sale soft-voids the sale's movements. **Editing** a sale does the same swap: its live `'sale'` movements are soft-voided and new ones inserted (never opposite correction rows), and only when the sale's per-product unit count actually changed — see [sales.md](sales.md) §2C. A **manual** row (`initial` / `restock` / `adjustment`) can be **corrected in place** — quantity, cost and note only, audited — for a wrongly *written* entry; something that really happened later is a new movement instead (§6C).
7. **A SHARED product has one stock pool** across every branch (RLS inherits the product's shared branch semantics, not the sale's owned ones).
8. **Negative stock is legal.** There is no DB constraint stopping it — two offline devices can each sell the last unit. It renders as "Short by N".

---

## 1. List screen

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Initial load | Navigate to Admin → Products | Products list loads; loading spinner shown until data arrives |
| 1.2 | Empty state | Tenant has no products | "No products yet" empty state with a "Create First Product" button |
| 1.3 | Non-empty list | Tenant has products | ProductCards rendered, one per product |
| 1.4 | Product card content | Look at a card | Shows product name, price (formatted in stored currency), optional notes |
| 1.5 | Shared badge | Product with `branch_id IS NULL` | Badge or label "Shared" (or no branch label — verify UI convention) |
| 1.6 | Branch-specific product | Product with branch_id set | Branch name shown on the card |
| 1.7 | Inactive product hidden | Soft-deleted product | Not visible in the list (only active products shown) |
| 1.8 | FAB / Add button | Tap | ProductFormSheet opens (create mode) |
| 1.9 | Pull-to-refresh | Pull down | List re-fetches |
| 1.10 | User role | Login as `user` | Products tab or menu item NOT present; route inaccessible |

---

## 2. Create product

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Happy path | Enter name + price + currency, submit | Product created and appears at top of list |
| 2.2 | Required: name | Leave name blank | Submit disabled |
| 2.3 | Required: price | Leave price blank | Submit disabled |
| 2.4 | Price in USD | Leave currency = USD, enter `50` | `price = 50, currency_id = null` |
| 2.5 | Price in tenant currency | Pick LBP, enter `100000` | `price = 100000, currency_id = LBP_id` |
| 2.6 | Optional notes | Leave notes blank | Product created, notes = null |
| 2.7 | Branch picker — tenant-wide admin | Open form as tenant-wide admin (branch_id null) | Branch picker visible; can pick a branch or leave as Shared |
| 2.8 | Branch picker — branch-scoped admin | Open form as branch-scoped admin | Branch picker not shown; product assigned to admin's own branch |
| 2.9 | Shared product — no branch | Tenant-wide admin creates product with no branch selected | `branch_id = NULL` (SHARED) |
| 2.10 | Duplicate name (same branch) | Create product with same name in same branch | Service or DB rejects (uniqueness constraint); ErrorBanner shown |
| 2.11 | Duplicate name (different branch) | Same name in branch A and branch B | Allowed — uniqueness is scoped to branch |
| 2.12 | Shared + branch-specific same name | Shared product named "Internet" + branch product named "Internet" | Allowed (same rule as plans) |
| 2.13 | tenant_id stamped automatically | Inspect the new row | `tenant_id` from JWT, not from client input |
| 2.14 | In-flight guard | Double-tap submit | Loading flag prevents duplicate creation |
| 2.15 | Network error | Disable network, submit | ErrorBanner inside sheet; sheet stays open |

---

## 3. Edit product

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open edit | Tap action menu → Edit on a product | ProductFormSheet opens pre-filled with current values |
| 3.2 | Edit name | Change name | Updated in the list |
| 3.3 | Edit price | Change price | Updated. **Existing sales retain their snapshotted `unit_amount`** — they do NOT update |
| 3.4 | Edit currency | Change currency | Updated. Existing sales retain their `currency_id` + `rate_per_usd_snapshot` snapshots |
| 3.5 | Edit notes | Change notes | Updated |
| 3.6 | Cancel | Tap Cancel | No change |
| 3.7 | Blank name on edit | Clear name | Submit disabled |

---

## 4. Delete product

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Delete with no sales | Tap action menu → Delete, confirm | Product hard-deleted; removed from list |
| 4.2 | Delete with existing sales | Tap action menu → Delete, confirm | Product soft-deleted (`active = false`); removed from list; existing sales retain `product_name_snapshot` |
| 4.3 | Confirm dialog | Tap Delete | ConfirmDialog: "Delete Product?" destructive style |
| 4.4 | Cancel delete | Tap Cancel on confirm | Product unchanged |
| 4.5 | Soft-deleted product in SaleFormSheet | Try to create a new sale, look at product picker | Soft-deleted product does NOT appear in the picker |
| 4.6 | Existing sale after soft-delete | View an existing sale that used the deleted product | Sale detail shows `product_name_snapshot` (the name frozen at sale time) — not affected by deletion |

---

## 5. Tier gating

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Free tier: 5-product limit | Add 5 products on Free tier | 5th product created successfully |
| 5.2 | Free tier: limit hit | Try to add 6th product on Free tier | `TierLimitError` → `UpgradePromptModal` shown. Product NOT created |
| 5.3 | Pro / Business: unlimited | Add products on Pro or Business tier | No cap; products created freely |
| 5.4 | UpgradePromptModal actions | Tenant-wide admin sees modal | Compact upgrade tier cards + "View plans" CTA; tapping navigates to Subscription screen |
| 5.5 | Branch-scoped admin limit reached | Branch admin hits Free limit | Stripped modal: "Limit reached — contact your administrator." Close button only |
| 5.6 | Upgrade then retry | Upgrade from Free to Pro, retry the create | Product created successfully; no modal |
| 5.7 | Usage count after creation | Create a product, check subscription usage | `products` usage counter increments |
| 5.8 | Usage count after soft-delete | Soft-delete a product | Usage counter decrements (or verify behavior — soft-deleted products may or may not count against limit) |

---

## 6. Branch and visibility

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Shared product visible to all branches | Create SHARED product, log in as branch B | Product visible in list and in SaleFormSheet product picker |
| 6.2 | Branch-specific product | Create product for branch A, log in as branch B | Product NOT visible to branch B |
| 6.3 | Branch-specific product | Log in as tenant-wide admin | All products visible regardless of branch |
| 6.4 | BranchSelector on list | Tenant-wide admin filters to branch A | Shows branch-A products + SHARED products |
| 6.5 | Branch deleted | Delete a branch with products | FK `ON DELETE SET NULL` reverts those products to SHARED (branch_id = null) |

---

## 6A. Stock

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6A.1 | Starting stock on create | Create a product with "Starting stock" = 5 | Card shows green "5 in stock"; the stock sheet history holds one `Starting stock` row of `+5` |
| 6A.2 | Starting stock left blank | Create a product, leave the field empty | Card shows red "Out of stock"; history is empty (no `initial` row is written for 0) |
| 6A.3 | Starting stock rejects junk | Type letters / a negative sign in the field | Field only accepts digits; a non-integer or negative value is rejected with "Starting stock must be a whole number of 0 or more" |
| 6A.4 | Edit form never edits the total | Open an existing product for edit | Stock is shown **read-only** next to an "Adjust Stock" link — there is no editable stock field |
| 6A.5 | Restock | Product menu → Adjust Stock → Add → 10 → Save | The stock sheet **closes on save**; on-hand rises by 10 immediately, and reopening it shows a green `Stock added` `+10` row stamped with today's date **and time** |
| 6A.6 | Restock with a note | Add 3 with note "new delivery", then reopen the stock sheet | The note shows on its own line under the date/time and who recorded it |
| 6A.7 | No manual removal | Open Adjust Stock and look for a way to take stock out | There is none — no Add/Remove toggle, and the quantity box only adds. The only ways down are a sale, **Edit entry** and **Revert entry** (§6C / §6D) |
| 6A.7b | Damaged / lost stock has no door | Two units break; try to record it | It cannot be recorded as such. Either edit the entry that added them (which changes that entry's own month) or leave the count as it is — a known gap of removing the Remove mode |
| 6A.7a | Failed save keeps the sheet open | Force the save to fail (e.g. offline write error) | The sheet stays open with the typed values and shows the error banner — it only closes on success |
| 6A.8 | Zero / empty quantity | Leave quantity empty or type 0 | Save button stays disabled |
| 6A.9 | Sale decrements | Sell 2 of a product with 5 in stock | Card shows "3 in stock"; history holds a red `Sold` `-2` row |
| 6A.10 | Void returns stock | Void that sale | On-hand returns to 5; the `Sold` row is struck through in the history |
| 6A.11 | Double void is safe | Void the same sale again (e.g. from another device after a sync) | Stock stays at 5 — it is NOT credited twice |
| 6A.12 | Out-of-stock chip | Drive a product to exactly 0 | Card chip turns red "Out of stock" |
| 6A.13 | Negative stock renders | Force a negative total (two offline devices each sell the last unit, then sync) | Card shows red "Short by N"; nothing crashes and both sales are kept |
| 6A.14 | Shared product, one pool | Shared product (`branch_id IS NULL`), restock 10, sell 3 from branch A and 2 from branch B | Every user — branch A, branch B, and a tenant-wide admin — sees the same 5 |
| 6A.15 | Branch-scoped user sees shared stock | Log in as a branch-scoped admin, open a SHARED product | Its stock reads correctly (NOT 0 / out of stock) and it can be sold |
| 6A.16 | Hard-delete takes the ledger | Delete a never-sold product that has stock movements | Product is hard-deleted; its `stock_movements` rows are gone (server FK cascade + local cascade) |
| 6A.17 | Soft-delete keeps the ledger | Delete a product that has been sold | Product is soft-deleted (`active = false`) and its movements survive |
| 6A.18 | Offline restock syncs | Airplane mode → restock +10 → reconnect | The movement pushes; a second device shows the same on-hand after its pull |
| 6A.19 | Offline sale syncs | Airplane mode → record a sale → reconnect | Both the sale and its stock movement land in Supabase; on-hand matches on a second device |
| 6A.20 | Stock survives a product edit | Edit a product's name / price | On-hand is unchanged (the edit path re-reads it rather than defaulting to 0) |
| 6A.21 | Existing install schema reconcile | Update the app on a device that already had local data | `applySchema` creates `stock_movements` (and adds any new column on an existing table) at startup — no "no such table" / "no such column" error, no wipe needed |
| 6A.22 | Stock sheet stacks on the form | Open a product for edit → tap "Adjust Stock" | The stock sheet opens **on top**; the edit form stays open underneath and is still there (with its typed values) after closing the stock sheet |
| 6A.23 | Form follows the adjustment | From the edit form, adjust stock +5 and save | The stock sheet closes back to the edit form, whose read-only stock now reads the new total |
| 6A.24 | Back closes one sheet at a time | With both sheets open, press Back (Android) / browser Back (web) | Only the stock sheet closes; the edit form stays open and the route does not change |
| 6A.25 | History shows date + time | Restock twice within the same hour | Both rows carry the date **and** hour:minute, so the two changes are told apart and stay newest-first |
| 6A.26 | History names the user | Restock as user A, then as user B, and reopen the sheet as an admin | Each row shows the full name of the user who recorded it (person icon + name); a row with no recorded user simply omits that line |
| 6A.27 | Reason icon + direction color | Compare a `Starting stock`, `Stock added`, an older `Correction` (negative, from data recorded before the Remove mode was taken out) and `Sold` row | Each has its own icon (flag / plus / pencil / cart); the tile and amount are green when the change adds stock and red when it removes |
| 6A.28 | Voided row is marked | Void a sale, then open the product's stock sheet | The `Sold` row is greyed out with the amount struck through and carries a "Reversed" chip |
| 6A.29 | Empty history | Open the stock sheet of a product with no movements | A dashed placeholder box with a clock icon and "No stock changes yet." — no bare text, no crash |
| 6A.30 | Total fills from the unit cost | Add → quantity 10, cost/unit 4.50 | "Total cost" reads 45 and an amber line says "Adds $45.00 to Expenses" |
| 6A.31 | Unit cost fills from the total | Add → quantity 10, then type 45 in "Total cost" | Cost per unit becomes 4.5 |
| 6A.32 | The typed field wins when the quantity changes | Type total 45 for 10 units, then change the quantity to 12 | Total stays 45 and cost/unit becomes 3.75 — the other way round when the **unit** was typed last (4.50 stays, total becomes 54) |
| 6A.33 | Total typed before the quantity | Leave the quantity empty, type total 45, then type quantity 10 | Cost per unit becomes 4.5 — the total waits for a quantity instead of being cleared |
| 6A.34 | Uneven division keeps its precision | Quantity 3, total 100 | Cost per unit reads 33.33333333, and that movement still prints $100.00 in Expenses — not $99.99 |
| 6A.35 | One currency for both | Change the currency on "Cost per unit" | "Total cost" shows the same code and has **no picker of its own**; neither amount is converted |
| 6A.36 | Editing an older negative row | On data that still holds a `Correction` `−2` row, menu → Edit entry, cost/unit 0.35 | The direction stays negative and a green line reads "Takes $0.70 off Expenses" — the credit shape is still readable and editable, just not creatable |
| 6A.38 | Edit fills both fields | Row menu → Edit entry on a row of 12 @ 0.50 | Cost per unit 0.5 and Total cost 6; changing either one still updates the other |
| 6A.39 | Only the total was typed | Type a total, nothing else, then close the sheet | "Discard changes?" is asked — the total counts as an edit |

---

## 6B. Batch restock

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6B.1 | Open from the products screen | Products → "Restock" button beside the search box | The Batch Restock sheet opens listing every **active** product with its current on-hand and a `[−] 0 [+]` stepper |
| 6B.2 | Open from quick actions | Any screen → 3-dot menu → "Batch Restock" | The same sheet opens; it loads the product list itself even on a screen that never fetched products |
| 6B.3 | Non-admin never sees it | Log in as a `user` and open the 3-dot menu on any screen | "Batch Restock" is absent (products are admin-only) |
| 6B.4 | Inactive products excluded | Soft-delete a product, then open the sheet | The inactive product is not listed |
| 6B.5 | Restock several at once | Set 10 on product A, 5 on product B, Save | Sheet closes; both cards show the new totals immediately, and each product's own history holds **one** green `Stock added` row (`+10` / `+5`) — no shared/grouping row |
| 6B.6 | Shared note lands on every row | Set quantities on 3 products, note "delivery 12 Aug", Save | All three history rows carry that note |
| 6B.7 | Row preview | Type 5 on a product with 3 in stock | The row turns indigo and reads `3 → 8`; the summary line updates to "1 products selected · +5" |
| 6B.8 | Stepper + typing agree | Use `+` / `−` and also type a number in the box | Both edit the same value; `−` stops at 0 and is greyed out there; letters and a minus sign are ignored |
| 6B.9 | Save disabled with nothing picked | Open the sheet and save without setting any quantity | Save button is disabled (a 0 on every row counts as nothing picked) |
| 6B.10 | Search keeps typed quantities | Set 5 on product A, search for product B, then clear the search | A still shows 5 and is still counted in the summary — filtering only changes the view |
| 6B.11 | Search with no match | Type a term matching nothing | "No product matches your search." — the note, summary and save button remain usable |
| 6B.12 | Clear | Set quantities on 2 products, tap "Clear" | Every row returns to 0, the summary reads 0, and Save goes disabled |
| 6B.13 | Failed save keeps the sheet open | Force the save to fail | The sheet stays open with the typed quantities and shows the error banner |
| 6B.14 | No active products | Open the sheet in a tenant with no active products | A dashed placeholder ("No active products to restock.") replaces the list, search and save |
| 6B.15 | Offline batch restock syncs | Airplane mode → restock 3 products → reconnect | All movements push in one go; a second device shows the same on-hand after its pull |
| 6B.16 | Branch scoping | As a branch-scoped admin, open the sheet | Only the products that user can see are listed (their branch + SHARED), and restocking a SHARED one moves the single shared pool |
| 6B.17 | Keyboard + sheet | Tap the search box, then a quantity box, on a phone | The sheet lifts so the focused field stays visible; the sheet still drags closed from its header |
| 6B.18 | Back closes the sheet | Press Back (Android) / browser Back (web) with the sheet open | Only the sheet closes; the route does not change |

---

## 6C. Editing a stock entry

An edit fixes an entry that was **written** wrong, in the entry's own month. It is one of the two doors out of a wrong stock number, the other being a revert (§6D) — a manual entry can no longer remove stock, so there is no "record a later event" door (§6A.7).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6C.1 | Menu only on correctable rows | Open the stock sheet of a product with a `Stock added`, a `Sold` and a voided row | The 3-dot menu shows on the `Stock added` row only — a `'sale'` row and a reversed row have none |
| 6C.2 | Edit a quantity | Restock +12, then row menu → Edit entry → change 12 to 10 → Save Changes | On-hand drops by 2; the history row now reads `+10`; **no** second row is added |
| 6C.3 | The month does not move | Do 6C.2 on a movement recorded last month | Last month's Expenses figure changes (12 × cost → 10 × cost); this month gains **nothing** — a correction always lands in the month of the entry it fixes |
| 6C.4 | Edit fills the form | Tap Edit entry on a row with quantity 12, cost 0.50, note "delivery" | Quantity, cost, currency and note are pre-filled from the row; an "Editing this entry" banner appears above the form, naming the reason, delta and date |
| 6C.4b | The message scrolls into view | Scroll far down the history, then tap a row menu → Edit entry | The body scrolls to the “Editing this entry” banner, so the message and the pre-filled form are on screen — without it the tap looks like it did nothing |
| 6C.4c | Switching edits scrolls again | While editing row A, scroll down and tap Edit entry on row B | The banner updates to row B and the body scrolls to it again |
| 6C.5 | Direction is locked | While editing a `+12` row, look for a way to make it `−12` | There is none — the form only adds, and the quantity box takes digits only |
| 6C.6 | Cancel an edit | Tap Edit entry, change the quantity, then tap the ✕ on the banner | The form returns to a blank add-stock state (cost pre-filled from the product again), the row is untouched, and closing the sheet does **not** prompt "discard changes?" |
| 6C.7 | Sheet stays open after saving | Save an edit | The sheet stays open, the history reloads with the new value, the form clears, and closing it prompts nothing |
| 6C.8 | Edit a cost | Edit entry → change cost/unit 0.50 → 0.45 (quantity untouched) | Expenses for that movement's month drops by quantity × 0.05; the history row's money line updates |
| 6C.9 | Cost currency re-freezes the rate | Edit entry → switch the cost currency USD → LBP | The row's `rate_per_usd_snapshot` is re-taken at today's rate (same rule as editing a payment) |
| 6C.10 | Quantity-only edit keeps the old rate | On an LBP-costed movement from months ago, change only the quantity | The USD value moves in proportion only — the frozen rate is **not** refreshed to today's |
| 6C.11 | Remove the cost | Edit entry → clear the cost field → Save | The movement keeps its stock but records no cost; that month's stock Expenses drop by the whole amount |
| 6C.12 | Add a cost to a costless row | Edit an old restock that never had a cost → type a cost → Save | Expenses for **that movement's month** rise by quantity × cost |
| 6C.13 | Negative-stock warning | Product with 12 in, 11 sold; edit the delivery down to 10 | An amber line reads "Stock will go to −1. You can still save." — the save is **allowed**, and the card then shows "Short by 1" |
| 6C.14 | Zero / empty quantity | While editing, clear the quantity or type 0 | Save stays disabled (the same rule as a new change) |
| 6C.15 | A sale's row is refused by the service | Try to edit a `'sale'` movement through any path | "A stock entry from a sale can't be changed here — edit or void the sale instead" |
| 6C.16 | A reverted row is refused | Try to edit a reversed movement | "This stock entry is already reversed" |
| 6C.17 | The edit is audited | Do 6C.2, then row menu → History | One `update` entry: staff, time, **Product** = the product's name, and "Quantity 12 → 10" |
| 6C.18 | Creating stock is NOT audited | Restock a product, then open that row's History | Empty ("no changes recorded") — the ledger row itself is the create record; only an edit or a revert is audited |
| 6C.19 | The audit log names the product | Admin → Audit Log → filter Record type = "Stock entry" | The edit is listed with the product's name in the subject pill (a cube icon, not a person), and the detail sheet's top row reads **Product** |
| 6C.20 | Audit survives a rename | Edit a movement, rename the product, then reopen the audit entry | The entry still names the product as it was called when the edit happened (the name is frozen) |
| 6C.21 | Branch filing | As a tenant-wide admin, edit a movement on a **branch** product, then filter the audit log to that branch | The entry appears under that branch; an edit on a **shared** product files as tenant-wide (visible in every branch view) |
| 6C.22 | Offline edit syncs | Airplane mode → edit a movement → reconnect | The corrected row and its audit entry both push; a second device shows the new quantity after its pull |
| 6C.23 | Two devices, latest wins | Edit the same movement on two offline devices, then sync both | The later `updated_at` wins (no duplicate row, no lost movement); both audit entries survive — they are append-only |
| 6C.24 | Non-admin | Log in as a `user` | The whole products area is unreachable, so the edit path is too; the History sheet would say "Admins only" |

---

## 6D. Reverting a stock entry

The entry should never have existed. It stops counting, but the row is **kept** (marked "Reversed") — reverting is a soft-void, not a row deletion.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6D.1 | Revert an entry | Restock +12, then row menu → Revert entry → confirm | On-hand drops by 12; the row stays in the history greyed out with the "Reversed" chip; **no** opposite row is added |
| 6D.2 | Confirm names the entry | Open Revert entry | The dialog reads "Stock added +12 will stop counting…" and explains that stock and expenses are corrected and the row stays marked "Reversed" |
| 6D.3 | Cancel does nothing | Open Revert entry → Cancel | The entry is untouched and the stock total is unchanged |
| 6D.4 | The expense goes with it | Revert a costed restock (12 @ 0.50) | That movement's month loses the whole $6.00 — see [expenses.md](expenses.md) |
| 6D.5 | The month does not move | Revert a movement recorded **last** month | Last month's Expenses drop; this month gains nothing — the same rule as an edit (§6C.3) |
| 6D.6 | A costless entry | Revert a restock that carried no cost | Stock drops; Expenses are unchanged (there was nothing to take off) |
| 6D.7 | Not offered on a sale's row | Open the menu on a `Sold` row | There is no menu at all — a sale's stock rows belong to the sale (void or edit the sale instead) |
| 6D.8 | A sale's row is refused by the service | Try to revert a `'sale'` movement through any path | "A stock entry from a sale can't be changed here — edit or void the sale instead" |
| 6D.9 | Already reverted | Revert the same entry twice (e.g. from a second device after a sync) | The second attempt is refused with "This stock entry is already reversed" — the stock is **not** credited twice |
| 6D.10 | A reverted row keeps its History | Revert an entry, then open that row's menu | Only **History** is left (no Edit, no Revert), and it holds the `void` entry naming who reverted it |
| 6D.11 | Reverting the row being edited | Tap Edit entry on a row, then revert that same row | The form resets to a blank add-stock state (it can no longer point at an entry that does not count), and closing the sheet prompts nothing |
| 6D.12 | Sheet stays open | Revert an entry | The sheet stays open, the history reloads with the "Reversed" row, and the stock card at the top shows the new total |
| 6D.13 | The revert is audited | Revert an entry, then row menu → History | One `void` entry: staff, time, **Product** = the product's name, and the changed fields read "Voided at, Voided by" |
| 6D.14 | Any staff member may revert | As a non-admin with access to the stock sheet, revert an entry | It is allowed (the same rule as editing); only the History read is admin-only |
| 6D.15 | Failed revert keeps the sheet open | Force the write to fail | The error banner shows, the entry is untouched, and the sheet stays open |
| 6D.16 | Offline revert syncs | Airplane mode → revert an entry → reconnect | The voided row and its audit entry both push; a second device shows the same on-hand after its pull |

---

## 7. Multi-tenancy

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Tenant isolation | Create product in tenant A | NOT visible when logged in as tenant B |
| 7.2 | RLS enforcement | Direct API call with tenant B token for tenant A product | Supabase RLS rejects |

---

## 8. Permissions matrix

| Operation | Admin (tenant-wide) | Admin (branch-scoped) | User |
|-----------|--------------------|-----------------------|------|
| View products list | ✓ | ✓ (branch + shared) | ✗ |
| Create product | ✓ | ✓ (own branch only) | ✗ |
| Edit product | ✓ | ✓ (own branch only) | ✗ |
| Delete product | ✓ | ✓ (own branch only) | ✗ |
| Use product in SaleFormSheet | ✓ | ✓ | ✓ |
