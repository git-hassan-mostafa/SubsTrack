# Plans — QA Scenarios

Covers the plan list, search, create / edit / delete via the action menu, the fixed-vs-custom toggle, **multi-month bundles (durationMonths 1–12)**, **currency selection** via `CurrencyInput`, **branch scoping** (shared vs branch-specific), and the consequences for customers and payments.

Plans CRUD is admin-only.

**Reference code:**
- Screen: [PlanListScreen.tsx](SubsTrack/src/modules/plans/screens/PlanListScreen.tsx)
- Form sheet: [PlanFormSheet.tsx](SubsTrack/src/modules/plans/components/PlanFormSheet.tsx)
- Card: [PlanCard.tsx](SubsTrack/src/modules/plans/components/PlanCard.tsx)
- Action menu: [ActionMenu.tsx](SubsTrack/src/shared/components/ActionMenu.tsx)
- Service: [PlanService.ts](SubsTrack/src/modules/plans/services/PlanService.ts)
- Repository: [PlanRepository.ts](SubsTrack/src/modules/plans/repository/PlanRepository.ts)
- Store: [planStore.ts](SubsTrack/src/modules/plans/store/planStore.ts)
- CurrencyInput (price field): [CurrencyInput.tsx](SubsTrack/src/shared/components/CurrencyInput.tsx)

**DB constraints:**
- `UNIQUE(tenant_id, branch_id, name)` — name unique per (tenant, branch). Because NULLs are not equal in Postgres, a "Shared" plan and a per-branch plan can both be named "Basic".
- If `is_custom_price = false`, `price` must be > 0 and non-null.
- `duration_months BETWEEN 1 AND 12`.
- Multi-month plans (`duration_months > 1`) MUST be fixed price — verified in `PlanService.validate`.
- `currency_id` FK uses `ON DELETE RESTRICT`.

---

## 0. Critical invariants

1. **Snapshot integrity.** Editing a plan's price NEVER changes existing payment amounts.
2. **Per-tenant + per-branch uniqueness.** A "Basic" Shared plan can coexist with a "Basic" Beirut plan and a "Basic" Tripoli plan.
3. **Multi-month requires fixed price.** Service throws if `durationMonths > 1` AND `isCustomPrice = true`.
4. **Currency lives on the plan, not derived.** USD = `currency_id IS NULL`.

---

## 1. Plan list — render and counts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Navigate to Plans | Admin tab → Plans | Title "Plans", "<N> active" subtitle |
| 1.2 | BranchSelector chip | Tenant-wide admin with ≥2 active branches | Chip rendered below PageHeader |
| 1.3 | Empty state | Tenant has no plans | EmptyState "No plans yet" + "Create First Plan" CTA |
| 1.4 | Plan cards | Tenant has plans | Each plan rendered with name, price (formatted in plan's currency) or "Custom pricing" sublabel, duration label ("/ month" or "/ 3 months"), branch badge for branch-scoped plans, ⋮ menu |
| 1.5 | USD plan card | Plan in USD | Formatted "$30 / month" |
| 1.6 | Tenant currency plan card | Plan in LBP at 50000 | Formatted "ل.ل 50,000 / month" + secondary line "≈ <USD eq via live rate>" |
| 1.7 | Multi-month card | 3-month plan at $90 | Formatted "$90 / 3 months" |
| 1.8 | Shared plan badge | branch_id = null in multi-branch tenant | "Shared" badge (visible to tenant-wide admin) |
| 1.9 | Branch plan badge | branch_id = Beirut | "Beirut" badge |
| 1.10 | Loading state | Pull-to-refresh | Spinner |
| 1.11 | Refresh on focus | Leave/return | `fetchPlans` re-runs |
| 1.12 | Branch chip switch refetch | Switch BranchSelector | Plan list re-fetches for new scope |

## 2. Search

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Search by partial name | Type fragment | Case-insensitive substring filter |
| 2.2 | No matches | Type a non-matching string | EmptyState |
| 2.3 | Clear search | Clear text | Full list returns |
| 2.4 | Debounce | Type rapidly | Last value wins |

## 3. Create plan — fixed single-month price

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open form | Tap "+ Add" | Sheet "Add Plan" with: Name*, Price (CurrencyInput)*, Duration months (default 1), Custom pricing toggle (default off), Branch picker (tenant-wide admin in multi-branch) |
| 3.2 | Required fields marked | Look at labels | Name and Price marked with "*" |
| 3.3 | Submit disabled when blank | Open the form | Submit disabled until Name + Price valid |
| 3.4 | Valid fixed USD plan | Name "Basic", Price 30, Currency USD, Duration 1 | Created; appears in list with "$30 / month" sublabel |
| 3.5 | Valid LBP plan | Pick LBP, Price 50000 | Stored with `currency_id = LBP_id, price = 50000`. Card shows LBP price |
| 3.6 | Trim name | Name = "  Basic  " | Stored as "Basic" |
| 3.7 | Price = 0 | Enter 0 | Service throws "Price must be greater than 0" |
| 3.8 | Negative price | Enter -5 | Same rejection |
| 3.9 | Non-numeric price | parseFloat = NaN | Submit disabled |
| 3.10 | Empty name | Clear Name | Submit disabled |
| 3.11 | Whitespace-only name | "   " | Submit disabled |
| 3.12 | Duplicate name in same (tenant, branch) | Create "Basic" twice for Beirut | Second create fails: "A plan with this name already exists" |
| 3.13 | Same name different branch | Create "Basic" in Beirut, then "Basic" in Tripoli | Both succeed |
| 3.14 | Same name Shared + branch | Create "Basic" as Shared, then "Basic" in Beirut | Both succeed |
| 3.15 | Same name different tenant | Tenant A "Basic", Tenant B "Basic" | Both succeed |
| 3.16 | Network error | Disable net, submit | ErrorBanner; sheet stays open |
| 3.17 | Loading state | Slow create | Spinner; fields stay populated |
| 3.18 | Cancel | Tap Cancel | Sheet closes |
| 3.19 | Hardware back | Android back | Sheet closes |

## 4. Create plan — custom pricing

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Toggle ON | Toggle "Custom Pricing" | Price input is HIDDEN |
| 4.2 | Submit | Name only, submit | Plan created with `is_custom_price = true, price = null`. Card shows "Custom pricing" sublabel |
| 4.3 | Toggle ON then OFF | Switch back | Price field reappears empty; Submit disabled until Price provided |
| 4.4 | Custom plan + duration > 1 disallowed | Toggle Custom on AND set duration to 3 | Service throws "Multi-month plans must have a fixed price"; UI also disables duration > 1 when Custom is on (verify) |
| 4.5 | Use custom plan in payments | Open a customer using this plan, tap unpaid month | Scenario C (manual amount required) — see [payments.md § 4](payments.md) |

## 5. Create plan — multi-month bundle

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Duration picker | Look at the form | Duration months field (number or dropdown) accepting 1–12 |
| 5.2 | Default duration | Open form | Duration = 1 |
| 5.3 | Create 3-month plan | Name "Quarterly", Price 90, Duration 3 | Created. Card shows "$90 / 3 months" |
| 5.4 | Duration = 0 | Enter 0 | Rejected (`BETWEEN 1 AND 12`) |
| 5.5 | Duration = 13 | Enter 13 | Rejected |
| 5.6 | Duration with custom price | Try Duration = 3 + Custom Pricing on | Service throws "Multi-month plans must have a fixed price" |
| 5.7 | Use multi-month plan in payments | Customer assigned plan, tap unpaid month | Scenario D in PaymentFormSheet; Quick Pay shows confirm dialog |

## 6. Branch scoping (multi-branch tenants)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Tenant-wide admin sees branch picker | Tenant has ≥1 active branch | Branch picker in the form: "Shared (all branches)" + each active branch. Default depends on BranchSelector state |
| 6.2 | Tenant-wide admin creates Shared plan | Pick "Shared" | `branch_id = NULL`. Visible to every branch |
| 6.3 | Tenant-wide admin creates Beirut plan | Pick Beirut | `branch_id = Beirut_id`. Visible only to Beirut (+ tenant-wide admins) |
| 6.4 | Branch-scoped admin — picker hidden | Beirut admin opens form | No branch picker. Created plan auto-assigned to Beirut |
| 6.5 | Branch admin cannot create Shared plan | Beirut admin | No "Shared" option — they always create branch-scoped plans |
| 6.6 | Zero-branch tenant — picker hidden | Tenant has 0 branches | No picker. Created with `branch_id = NULL` (which means Shared in this context but functionally the same) |

## 7. Edit plan

Launched from the action menu (Edit item) or by tapping the card body (verify which trigger is wired).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Open edit | Tap a plan / Edit menu | Sheet "Edit Plan" with fields prefilled |
| 7.2 | Change name | Update Name | Card updates after save |
| 7.3 | Change price | Update Price | Card updates. Existing payments unchanged (snapshots) |
| 7.4 | Change currency | Switch USD → LBP | `currency_id = LBP_id`. Price treated as the typed value in the new unit (no conversion) |
| 7.5 | Toggle fixed → custom | Switch toggle on, save | `is_custom_price = true`, `price = null` |
| 7.6 | Toggle custom → fixed | Switch toggle off, supply price | Becomes fixed |
| 7.7 | Toggle to fixed without price | Switch off, clear price, save | Rejected |
| 7.8 | Change duration | Update duration months | Saved. Future payments use new duration; existing payments keep their snapshotted duration_months |
| 7.9 | Change branch | Tenant-wide admin reassigns plan to a different branch | branch_id updated. Customers on the plan are unaffected (their plan_id still points correctly) |
| 7.10 | Rename to existing name | Conflict on (tenant, branch, name) | "A plan with this name already exists" |
| 7.11 | Snapshot integrity | Edit price of plan that has paid customers | Existing payment amounts UNCHANGED |
| 7.12 | Cancel | Tap Cancel | No persistence |
| 7.13 | Network failure | Disable net, save | ErrorBanner; original values still in list |

## 8. Action menu

Available per card via ⋮ or long-press.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Items | Open menu | Edit + Delete items shown |
| 8.2 | Edit | Tap Edit | Opens Edit Plan sheet |
| 8.3 | Delete | Tap Delete | ConfirmDialog destructive |

## 9. Delete plan

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Confirm dialog | Tap Delete | "Delete '<name>'? Customers assigned to this plan will have their plan removed." |
| 9.2 | Cancel | Tap Cancel | No change |
| 9.3 | Confirm | Tap Delete | Plan removed from list |
| 9.4 | Cascade — customers | Customers using this plan | After delete, their `plan_id` → null. Display "No plan" |
| 9.5 | Cascade — payments | Existing payments referencing this plan | `plan_id` → null. Amount snapshot remains |
| 9.6 | Customer detail with plan-removed | Open detail of an affected customer | Header shows "No plan"; new payments require manual amount |
| 9.7 | Currency FK block | Try to delete a referenced currency from Currencies screen | Soft-delete instead. Plan stays valid. (See [currencies.md § 6](currencies.md)) |
| 9.8 | Repeated rapid deletes | Tap delete multiple times | Only one delete request fires |
| 9.9 | Network error | Disable net | ErrorBanner; plan still present |

## 10. Visibility / permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Admin sees Admin tab | Login as admin | Admin tab visible, Plans accessible |
| 10.2 | User does not see Admin tab | Login as user | Admin tab hidden |
| 10.3 | Deeplink as user | Try to navigate to `/(app)/(tabs)/admin/plans` | Should not be reachable from UI; RLS gates writes; verify reads are also blocked |

## 11. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Plan name with leading/trailing spaces | "  Premium  " | Stored as "Premium" |
| 11.2 | Plan name with special chars | "Premium 🚀 / VIP" | Saved, displayed correctly |
| 11.3 | Plan name very long | 200 chars | Saved; card truncates with ellipsis |
| 11.4 | Price with many decimals | "12.999" in USD (decimals=2) | DB rounds to 13.00 |
| 11.5 | Price boundary | $0.01 | Accepted (>0) |
| 11.6 | Price max | $99,999,999.99 | Accepted, displayed |
| 11.7 | Plan list while creating in another session | Admin A creates, admin B refreshes | Admin B sees the new plan after refresh |
| 11.8 | Delete plan while it's selected in a customer form | Open create-customer, dropdown shows plan; delete in another session; submit | FK doesn't exist → write fails. Surface friendly error |
| 11.9 | Tenant scoping | Create plan in tenant A, log in as tenant B | Plan invisible (RLS) |
| 11.10 | Currency change after payments | Change LBP plan to EUR | Existing payments still display in LBP (their stored currency_id). Card shows EUR going forward |
| 11.11 | Currency soft-deleted then plan opened | Soft-delete LBP; open a LBP plan's edit form | Verify form gracefully shows the (now-inactive) currency or falls back to USD |
| 11.12 | Duration > 1 with currency | Multi-month LBP plan | Valid combination, no special restriction |
| 11.13 | Branch deleted (soft) | Plan was in Beirut, Beirut soft-deleted | Plan's branch_id unchanged. Display label may show "—" or the inactive branch's name. Verify UI |
| 11.14 | Branch hard-deleted | Branch FK `ON DELETE SET NULL` | Plan's branch_id → null. Becomes Shared by default |
