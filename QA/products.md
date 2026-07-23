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
