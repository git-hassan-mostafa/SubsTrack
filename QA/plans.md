# Plans — QA Scenarios

Covers the plan list, search, create / edit / delete, the fixed-vs-custom toggle, validation, and the consequences for customers and payments. Plans are admin-only.

**Reference code:**
- Screen: [PlanListScreen.tsx](SubsTrack/src/modules/plans/screens/PlanListScreen.tsx)
- Form sheet: [PlanFormSheet.tsx](SubsTrack/src/modules/plans/components/PlanFormSheet.tsx)
- Card: [PlanCard.tsx](SubsTrack/src/modules/plans/components/PlanCard.tsx)
- Service: [PlanService.ts](SubsTrack/src/modules/plans/services/PlanService.ts)
- Repository: [PlanRepository.ts](SubsTrack/src/modules/plans/repository/PlanRepository.ts)
- Store: [planStore.ts](SubsTrack/src/modules/plans/store/planStore.ts)

**DB constraints:** `UNIQUE(name, tenant_id)`. If `is_custom_price = false`, price must be > 0 and non-null.

---

## 1. Plan list — render and counts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Navigate to Plans | From Admin tab → "Plans" | Title "Plans", "<N> active" subtitle |
| 1.2 | Empty state | Tenant has no plans | EmptyState: "No plans yet" / "Tap '+ Add Plan' to create one" |
| 1.3 | Plan cards | Tenant has plans | Each plan rendered with name and price (or "Custom pricing" sublabel) |
| 1.4 | Count badge accuracy | After create/delete | "<N> active" updates immediately |
| 1.5 | Loading state | Pull-to-refresh | Spinner; on completion, list re-renders |
| 1.6 | Refresh on focus | Leave Plans screen and return | `fetchPlans` called via `useFocusEffect` |
| 1.7 | Order | Plans loaded | Sorted by underlying repo order; verify expected order matches spec (default: insertion order via `findAll()`). If alphabetical is expected, confirm and file a finding |

## 2. Search

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Search by partial name | Type plan name fragment | Filters case-insensitively |
| 2.2 | No matches | Type a non-matching string | EmptyState shown |
| 2.3 | Clear search | Clear text | Full list returns |
| 2.4 | Debounce | Type rapidly | Last value wins after debounce |

## 3. Create plan — fixed price

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open form | Tap "+ New plan" | Sheet "Add Plan" with fields: Plan Name, Price, Custom Pricing toggle |
| 3.2 | Submit disabled when blank | Open form | Submit disabled until Name and Price are non-blank |
| 3.3 | Valid fixed plan | Name = "Basic", Price = 30, isCustomPrice = false | Plan created; appears in list with "$30 / month" sublabel |
| 3.4 | Trim name | Name = "  Basic  " | Stored as "Basic" |
| 3.5 | Lowercase price decimal | Price = "29.99" | Stored as 29.99 |
| 3.6 | Price = 0 | Type 0 in price | Service throws "Price must be greater than 0"; ErrorBanner inside sheet |
| 3.7 | Negative price | Type -5 | Same rejection |
| 3.8 | Non-numeric price | Type "abc" | Submit disabled (decimal-pad keyboard prevents most cases). If forced, parseFloat = NaN → service throws "Fixed plans require a price" |
| 3.9 | Empty name | Clear Name field | Submit disabled |
| 3.10 | Whitespace-only name | Type "   " | Submit disabled |
| 3.11 | Duplicate name within tenant | Create plan "Basic" twice | Second create fails: "A plan with this name already exists". Sheet stays open |
| 3.12 | Same name in different tenant | Create "Basic" in tenant A, login as tenant B and create "Basic" | Allowed (uniqueness is per tenant) |
| 3.13 | Network error on create | Disable network, submit | ErrorBanner; sheet stays open with values |
| 3.14 | Loading state | Slow create | Submit button shows spinner; fields stay populated |
| 3.15 | Cancel button | Tap Cancel | Sheet closes, no plan created |
| 3.16 | Hardware back | Android back during sheet | Sheet closes |

## 4. Create plan — custom pricing

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Toggle ON | Toggle "Custom Pricing" | Price input is HIDDEN |
| 4.2 | Submit with toggle ON | Name only, submit | Plan created with `is_custom_price = true`, `price = null`. Card shows "Custom pricing" sublabel |
| 4.3 | Toggle ON then OFF | Switch back | Price field reappears empty; Submit disabled until Price provided |
| 4.4 | Custom plan name uniqueness | Same as fixed, per tenant | Same constraint applies |
| 4.5 | Custom plan in payments | Open a customer using this plan, tap unpaid month | Form scenario C (manual amount required) |

## 5. Edit plan

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Open edit | Tap a plan card | Sheet "Edit Plan" with fields prefilled |
| 5.2 | Change name | Update Name and save | Plan name updated in list |
| 5.3 | Change price | Update Price | Plan price updated in list |
| 5.4 | Toggle from fixed to custom | Switch toggle ON, save | Plan now custom; price field is null in DB |
| 5.5 | Toggle from custom to fixed | Switch toggle OFF, supply price | Plan now fixed-price |
| 5.6 | Toggle to fixed without price | Switch off and clear price, save | Service throws "Fixed plans require a price" |
| 5.7 | Edit name to existing one | Rename to a duplicate name | "A plan with this name already exists" |
| 5.8 | Snapshot integrity | Edit price of plan that has paid customers | Existing payment amounts UNCHANGED (they are snapshots). New payments use the new price |
| 5.9 | Cancel | Tap Cancel | No persistence |
| 5.10 | Network failure | Disable net, save | ErrorBanner; original values still in list |

## 6. Delete plan

Two entry points: card delete icon (via PlanCard's `onDelete`) and the "Delete plan" button at the bottom of the Edit sheet.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Confirm dialog | Tap delete | Dialog: "Delete Plan" / "Delete '<name>'? Customers assigned to this plan will have their plan removed." Destructive (red) action |
| 6.2 | Cancel deletion | Tap Cancel | No change |
| 6.3 | Confirm deletion | Tap Delete | Plan removed from list |
| 6.4 | Cascade — customers | Customers using this plan | After delete, their `plan_id` becomes null. They display "No plan" |
| 6.5 | Cascade — payments | Existing payments referencing this plan | `plan_id` set to null. Amount snapshot remains |
| 6.6 | Customer detail with plan-removed | Open detail of a customer whose plan was just deleted | Header shows "No plan"; year card unchanged; new payments require manual amount |
| 6.7 | Delete from edit sheet | Open Edit, tap "Delete plan" at bottom | Edit sheet closes, then confirm dialog appears |
| 6.8 | Delete sheet copy | Below the delete button, in the Edit sheet | "Customers will keep their existing payment history" |
| 6.9 | Repeated rapid deletes | Tap delete multiple times | Only one delete request fires; idempotent on retry |
| 6.10 | Network error on delete | Disable net | ErrorBanner; plan still present |

## 7. Visibility / permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Admin sees Admin tab | Login as admin | Admin tab visible, Plans accessible |
| 7.2 | User does not see Admin tab | Login as user | Admin tab is hidden (`isAdmin` is false) |
| 7.3 | Deeplink as user | Try to navigate to `/(app)/(tabs)/admin/plans` | Should not be reachable from UI; if forced via deeplink, RLS should still gate writes. Verify reads also blocked or screen renders empty |

## 8. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Plan name with leading/trailing spaces | "  Premium  " | Stored as "Premium" |
| 8.2 | Plan name with special chars | "Premium 🚀 / VIP" | Saved, displayed correctly |
| 8.3 | Plan name very long | 200 chars | Saved; card truncates with ellipsis |
| 8.4 | Price with many decimals | "12.999" | Service accepts; DB rounds to 13.00 (numeric(12,2)) |
| 8.5 | Price boundary | $0.01 | Accepted (>0) |
| 8.6 | Price max | $99,999,999.99 | Accepted, displayed |
| 8.7 | Plan list while creating in another session | Admin A creates a plan, admin B refreshes | Admin B sees the new plan after refresh |
| 8.8 | Delete plan while it's selected in a customer form | Open create-customer, dropdown shows plan; delete the plan in another session; submit | If customer was assigned the deleted plan, write fails (FK doesn't exist) — surface error |
| 8.9 | Edit form opens with stale data | Two admins editing same plan | Last write wins; second admin sees no warning (acceptable for v1) |
| 8.10 | Tenant scoping | Create plan in tenant A, log in as tenant B | Plan is invisible (RLS) |
| 8.11 | Custom-price toggle persists across reopen | Toggle on, close, reopen | Form resets to plan's saved value (or false on create) |
