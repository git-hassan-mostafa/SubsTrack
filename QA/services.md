# Services — QA Scenarios

Covers the **service price list** (Admin → Services): the reusable jobs a tenant charges for — installation, a repair visit, a router setup. It is the `products` catalog minus stock and minus cost, because labour is not bought and so is never an expense.

A service is **sold as a line on a sale**, never as its own record. Recording, editing and voiding a sale that holds a service line is covered in [sales.md](sales.md) §2A-b and §2C.25a–f. There is **no** Transactions → Services tab — the placeholder was removed, because the Sales tab already lists every service sold.

**Reference code:**
- Screen: [ServiceListScreen.tsx](SubsTrack/src/modules/admin/service-catalog/screens/ServiceListScreen.tsx)
- Service: [ServiceCatalogService.ts](SubsTrack/src/modules/admin/service-catalog/services/ServiceCatalogService.ts)
- Repository: [ServiceRepository.ts](SubsTrack/src/modules/admin/service-catalog/repository/ServiceRepository.ts) (+ `.offline`)
- Form sheet: [ServiceFormSheet.tsx](SubsTrack/src/modules/admin/service-catalog/components/ServiceFormSheet.tsx)
- Card: [ServiceCard.tsx](SubsTrack/src/modules/admin/service-catalog/components/ServiceCard.tsx)
- Slice: [serviceSlice.ts](SubsTrack/src/state/slices/services/serviceSlice.ts)
- Route: [admin/services.tsx](SubsTrack/app/(app)/(tabs)/admin/services.tsx)

---

## 0. Critical invariants

1. **A service has NO stock and NO cost.** No `stock_movements` row is ever written for one, and it never appears in Transactions → Expenses. Staff pay is typed by hand under the `salaries` expense category.
1b. **The price is per JOB, not per unit.** A service line on a sale has no quantity at all — one price, one line, and two jobs are two lines. So this list's price is the whole fee for doing the thing once (see [sales.md](sales.md) §2A-b).
2. **Never hard-deleted when referenced by a sale line.** `deleteService()` checks `countReferences(id)` over `sale_items.service_id` — **including lines an edit soft-voided**, because the FK is `ON DELETE RESTRICT`. Any reference → `active = false`; none → hard delete.
3. **`branch_id IS NULL` means SHARED** — visible to every branch, same as plans and products.
4. **NOT tier-gated.** Unlike products (`max_products`), services are uncapped. There is no usage bar and no upgrade prompt.
5. **`null currency_id` means USD** throughout — same rule as payments, plans and products.
6. **Writable by ANY tenant member, not just admins.** RLS (`services_modify`) copies `products_modify` verbatim, which is what lets a collector add a service from the sale form. The *screen* sits under Admin, but the permission does not.
7. **`UNIQUE(tenant_id, branch_id, name)`** — a shared and a branch-specific service may share a name (NULLs compare unequal in Postgres).
8. **A one-off service creates NO row here.** Typing a name on a sale line stores it in `sale_items.item_name_snapshot` with `service_id IS NULL`.

---

## 1. List screen

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Entry point | Admin menu | A "Services" row (tool icon) sits after Products; its subtitle has **no count** (services are uncapped) |
| 1.2 | Initial load | Tap it | List loads; spinner until data arrives |
| 1.3 | Empty state | Tenant has no services | "No services yet" + a "Create First Service" button |
| 1.4 | Card content | Look at a card | Name, optional description, price on the right in the display currency, **"per job"** caption (not "each" — a service is never counted). **No stock pill** (that is the visible difference from a ProductCard) |
| 1.5 | Inactive service | Soft-deleted service | Card is dimmed with an "Inactive" caption, sorted after the active ones |
| 1.6 | Search | Type part of a name | List filters by name (debounced) |
| 1.7 | Pull-to-refresh | Pull down | List re-fetches |
| 1.8 | Back | Tap the back chevron | Returns to the admin menu |
| 1.9 | Branch chip | Tenant-wide admin switches the header branch | List re-fetches; shared services stay visible alongside that branch's own |
| 1.10 | Branch-scoped user | Log in as a branch admin | Only that branch's services + shared ones are listed |

---

## 2. Create / edit (ServiceFormSheet)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Open create | Tap the FAB | Sheet opens titled "Add Service" with Name, Description, Branch, Price |
| 2.2 | No stock / cost fields | Inspect the form | There is **no** cost price and **no** starting-stock field (unlike ProductFormSheet) |
| 2.3 | Name required | Leave name empty | Submit disabled |
| 2.4 | Price required | Leave price empty or 0 | Submit disabled |
| 2.5 | Price must be positive | Force a negative price | Save fails with "Price must be greater than 0" |
| 2.6 | Create succeeds | Name "Installation", price 25 USD, save | Sheet closes; the service appears at the top of the list |
| 2.7 | Duplicate name | Create "Installation" again in the same branch | Save fails with "A service with this name already exists" |
| 2.8 | Same name, different branch | Create "Installation" as shared, then again scoped to Branch A | Both save (NULLs compare unequal) |
| 2.9 | Branch default (branch-scoped user) | Open the form as a branch admin | Branch is pre-set to theirs and cannot be changed to Shared |
| 2.10 | Branch default (single-branch tenant) | Open the form | The only branch is pre-selected |
| 2.11 | Shared is offered to a tenant-wide admin | Open as a tenant-wide admin in a multi-branch tenant | Branch picker offers "Shared (all branches)" |
| 2.12 | Open edit | Tap a card | Sheet opens titled "Edit Service" with every field prefilled |
| 2.13 | Edit saves | Change the price and save | Card shows the new price |
| 2.14 | Rename does not rewrite history | Rename a service that has been sold, open an old sale's receipt | The receipt still shows the **old** name (`item_name_snapshot` is frozen) |
| 2.15 | No false discard prompt | Open the edit form and close it without touching anything | Closes straight away — no "Discard changes?" |
| 2.16 | Real change prompts | Change the name, then close | "Discard changes?" appears; "Keep editing" preserves the change |
| 2.17 | Currency | Set the price in LBP | Saves with `currency_id` = LBP; the card formats into the display currency |

---

## 3. Delete / reactivate

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Hard delete (never sold) | Create a service, then delete it from the card menu | Confirm dialog, then the row is **gone** from the DB |
| 3.2 | Soft delete (sold before) | Sell a service, then delete it | Row is kept with `active = false`; the card goes dim with "Inactive" |
| 3.3 | Soft delete counts VOIDED lines too | Sell a service, edit that sale to drop the line, then delete the service | Still **soft**-deleted — a soft-voided `sale_items` row still holds the FK |
| 3.4 | Existing sale unaffected | After 3.2, open that sale's receipt | Line still shows the frozen name and price; no crash |
| 3.5 | Inactive is unpickable on a new sale | After 3.2, open a sale form | The service is not offered in the dropdown |
| 3.6 | Reactivate | Card menu → Reactivate on an inactive service | Becomes active again and is pickable |
| 3.7 | Delete from the form | Open edit → Delete | Same confirm + same soft/hard outcome; the form closes |
| 3.8 | Bulk delete, mixed | Long-press to select a never-sold and a sold service, delete | The never-sold one is removed, the sold one goes inactive — in one action |
| 3.9 | Bulk delete of one | Select exactly one and delete | Falls back to the single-item confirm wording |
| 3.10 | Deletion warning copy | Open edit on any service | The footer reads "Deletion can't be undone." |

---

## 4. Multi-select

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Enter selection | Long-press a card | Selection mode; the icon tile becomes a checkbox and the toolbar replaces the header |
| 4.2 | Select all | Tap the select-all checkbox | Every **visible** (filtered) card is selected |
| 4.3 | Filtered-out rows are safe | Select a card, then type a search that excludes it, then delete | Only the still-visible selected rows are acted on |
| 4.4 | Single selection → edit | Select one card | The toolbar offers Edit as well as Delete |
| 4.5 | Inactive single selection | Select one inactive card | The toolbar also offers Reactivate |
| 4.6 | Android back exits selection | Press Back while selecting | Selection clears; the screen does not pop |

---

## 5. Audit trail

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Create is recorded | Create a service, open its card menu → History | One "Created" entry naming the actor and the device time |
| 5.2 | Edit records only the changed columns | Change only the price | The entry's "Fields changed" reads Price alone |
| 5.3 | Soft delete is an update | Soft-delete a sold service | An entry shows Active true → false |
| 5.4 | Hard delete is recorded | Hard-delete a never-sold service | A "Deleted" entry with the whole removed row |
| 5.5 | Reactivate is a restore | Reactivate an inactive service | The entry's action reads "Restored" |
| 5.6 | Global log filter | Admin → Audit Log → table filter | "Service" is one of the options and lists these entries |
| 5.7 | Non-admin cannot read | Log in as a collector, open a service's History | The admin-only empty state (RLS returns nothing) |

---

## 6. Offline

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Create offline | Airplane mode → create a service | Saves locally and appears in the list at once |
| 6.2 | Push on reconnect | Reconnect and sync | The service exists on the server; the local row is no longer `_dirty` |
| 6.3 | Sell it offline | Offline, record a sale using the offline-created service | Both push in order (services before sales before sale_items) — no FK error in the sync log |
| 6.4 | Edit offline | Offline, change a price | Saves locally; latest-`updated_at` wins on sync |
| 6.5 | Hard delete offline | Offline, delete a never-sold service | Row goes and a `pending_deletes` entry is logged; the server row disappears after sync |
| 6.6 | Pull on a second device | Create on device A, sync both | Device B lists it after its next pull |
| 6.7 | Branch scoping offline | Branch-scoped user syncs | Only their branch's + shared services are mirrored locally |

---

## 7. Permissions matrix

| Action | superadmin | admin (tenant-wide) | admin (branch) | user (collector) |
|--------|-----------|---------------------|----------------|------------------|
| Open Admin → Services | ✅ | ✅ | ✅ | ❌ (no admin tab) |
| Create a shared service | ✅ | ✅ | ❌ (forced to own branch) | — |
| Create a branch service | ✅ | ✅ | ✅ (own branch only) | — |
| Add a service from the sale form | ✅ | ✅ | ✅ | ✅ |
| Type a one-off service on a sale | ✅ | ✅ | ✅ | ✅ |
| Read a service's History | ✅ | ✅ | ✅ (own branch) | ❌ |
