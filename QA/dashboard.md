# Dashboard — QA Scenarios

Covers the admin dashboard metrics: monthly revenue (USD-converted via payment snapshots, formatted in the user's display currency), active customer count, paid/unpaid this month, total customers/users/plans. Admin-only, reached from Admin tab → Dashboard.

The compact stats card on the Admin landing screen also surfaces a subset of these metrics.

**Reference code:**
- Screen: [DashboardScreen.tsx](SubsTrack/src/modules/dashboard/screens/DashboardScreen.tsx)
- Service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Store: [dashboardStore.ts](SubsTrack/src/modules/dashboard/store/dashboardStore.ts)
- Admin home (compact stats card): [admin/index.tsx](SubsTrack/app/(app)/(tabs)/admin/index.tsx)
- Currency conversion: [currency.ts](SubsTrack/src/core/utils/currency.ts)
- Display currency preference: [uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts)

---

## 0. Critical invariants

1. **Aggregates are USD-converted via snapshots.** `DashboardService.getMetrics()` fetches `{amount_paid, rate_per_usd_snapshot}` rows for the current billing month and divides each by its snapshot before summing. The total is then formatted in the user's display currency.
2. **Voided payments are excluded** from monthly_revenue and from the "paid customers" count.
3. **Non-regular customers are excluded** from `unpaidThisMonth` and the unpaid customer count on the hero.
4. **Branch-aware metrics.** When BranchSelector is set to a specific branch, all 6 metrics scope to that branch (plans include shared).
5. **Promise.all on 6 metrics.** Parallel fetch. One failure rejects the whole batch.

---

## 1. Greeting and date

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Greeting | Open Dashboard | "Hello, <username>" |
| 1.2 | Username capitalization | Username = "alice" | Renders as "alice" (no transform) |
| 1.3 | Date label | Sub-title under greeting | Today's weekday + month + day |
| 1.4 | Locale | App in English / Arabic | Date follows active locale (verify — file a finding if hardcoded en-US) |

## 2. Hero card — Monthly Collected (USD-converted, display-currency formatted)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Month label | Top-left of hero | Uppercase three-letter month + year (e.g. "MAY 2026 COLLECTED") |
| 2.2 | Amount | Big number | Total of `amount_paid / rate_per_usd_snapshot` for non-voided payments in the current billing month, formatted in the user's display currency |
| 2.3 | Mixed currency totals | Pay $50 (USD) + 50,000 LBP (snapshot rate 50,000) | Both → 1 USD each → $2.00 (or LBP equivalent if display=LBP) |
| 2.4 | Sub-text | Below amount | "<paidCustomers> of <activeCustomers> active customers · <pct>% collected" |
| 2.5 | Paid customers calc | Paid = activeCustomers − unpaidThisMonth (regular only) | Cannot go negative |
| 2.6 | Progress bar — full | All active regulars paid | Bar at 100% width |
| 2.7 | Progress bar — empty | No active customers | Bar at 0%; division-by-zero handled |
| 2.8 | Progress bar — partial | 4 of 10 paid | 40% |
| 2.9 | Voided payment excluded | Pay $100 then void | monthly_revenue drops by $100; collected % drops accordingly |
| 2.10 | Live currency rate change does NOT shift hero | Pay 50000 LBP at rate 50000 (= $1). Admin then edits LBP rate to 100000 | Hero still shows $1 from that payment (uses snapshot, not live rate) |
| 2.11 | Display currency change | Switch display from USD to LBP | Hero immediately reformats (re-renders), still based on USD-aggregated total |
| 2.12 | Inactive customer with current-month payment | Inactive customer paid this month (arrears) | Their amount is INCLUDED in monthly_revenue (revenue is collection-based). But they are NOT counted in active/paid customers (which uses `active = true`) |
| 2.13 | Branch-scoped hero | Tenant-wide admin picks Beirut | Only Beirut customer payments included |

## 3. Stat cards (Unpaid / New This Month)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Unpaid card | Left card | Red dot, "UNPAID" label, count of active REGULAR customers without a non-voided payment in current month |
| 3.2 | "New This Month" label | Right card | Verify whether the displayed metric matches the label or is `totalCustomers`. (Pre-existing finding — confirm intent) |
| 3.3 | Non-regular excluded | Tenant has active non-regular customers with no current-month payment | Unpaid count does NOT include them |
| 3.4 | Empty tenant | Zero customers | Both cards show 0 |
| 3.5 | Zero unpaid | All active regulars paid | Unpaid = 0 |

## 4. Loading and refresh

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | First open — no metrics yet | Tab focus while metrics is null | ActivityIndicator centered, no stale numbers |
| 4.2 | Subsequent loads | After metrics exist | Hero/stats visible while fetching |
| 4.3 | Pull-to-refresh | Pull down | Spinner; values refresh |
| 4.4 | Refresh on focus | Leave tab and return | `fetchMetrics` re-runs |
| 4.5 | Network error | Disable net, refresh | ErrorBanner above hero. Existing values preserved |
| 4.6 | Concurrent updates | Pay in another session, then refresh dashboard | Hero amount and Paid count update |
| 4.7 | BranchSelector switch | Switch chip while on Dashboard | Metrics re-fetch for new scope |

## 5. Multi-tenancy

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Tenant A metrics | Login to A | Numbers reflect ONLY tenant A |
| 5.2 | Tenant B metrics after re-login | Logout, login as B | Numbers reflect tenant B only; no flash of A's numbers |
| 5.3 | Inactive tenant | Login forces TenantInactiveScreen | Dashboard never renders |

## 6. Permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | User role | Login as user | Admin tab not present; Dashboard not reachable from UI |
| 6.2 | Admin role | Login as admin | Dashboard reachable |
| 6.3 | Branch admin | Branch admin lands on Dashboard | Metrics scope to their branch (no chip; RLS does the work) |

## 7. Admin home compact stats card

The Admin tab landing screen has its own compact summary that shares the dashboard store.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Compact "Collected" cell | Top-left | Compact format: `$1.2k` for ≥1000, `$30` for <1000 (or display-currency equivalent) |
| 7.2 | Compact "Unpaid" cell | Middle | Red number = unpaidThisMonth |
| 7.3 | Compact "Customers" cell | Right | Total customer count |
| 7.4 | Loading state | First load | ActivityIndicator inside the Collected cell |
| 7.5 | Menu items | Below stats | Rows: Dashboard, Tenant Settings, Branches (if multi-branch), Currencies, Plans, Staff |
| 7.6 | Member count subtitle | Staff row | "<N> members" — uses metrics.totalUsers |
| 7.7 | Plan count subtitle | Plans row | "<N> plans" — uses metrics.totalPlans |
| 7.8 | Navigation | Tap a menu row | Pushes the corresponding screen |
| 7.9 | Refresh on focus | Switch tabs and return | Metrics refresh |

## 8. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Customer with payment but inactive | Active = false, has payment for current month | totalCustomers includes them; activeCustomers does not. Their payment counts in monthly_revenue |
| 8.2 | Customer paid future month, not current month | Pay June while in May | June payment does NOT appear in May's monthly_revenue. Customer remains "unpaid" for May |
| 8.3 | Two payments same customer different months | Customer paid March and April | Each month's metric isolates correctly |
| 8.4 | Time zone day boundaries | Open dashboard at 23:59 vs 00:01 | "Current month" computed via `getCurrentYearMonth()` (local time); no flicker / double-counting |
| 8.5 | Voided payment in current month | Void today's payment | unpaidThisMonth +1, monthlyRevenue -amount, paidCustomers -1 |
| 8.6 | Many customers (perf) | 5000 customers | Counts use `count: 'exact', head: true`; verify performance |
| 8.7 | Failed parallel fetch | One of the 6 parallel queries fails | Promise.all rejects → ErrorBanner. Existing values preserved |
| 8.8 | Partial payment effect | Customer paid 50/100 for current month | Customer counted as PAID (their `paid_at` exists, not voided, `amount_paid > 0`). monthly_revenue includes the 50 |
| 8.9 | Multi-month payment effect | Customer pays Jan–Mar in Jan | Only the source month (Jan) is in monthly_revenue. Feb and Mar dashboards (when viewed in Feb/Mar) will NOT show that payment in their monthly_revenue — but the customer is counted as PAID via the coverage map |
| 8.10 | "Paid this month" via multi-month coverage | Look at Feb dashboard, customer is covered by a Jan–Mar bundle | Verify customer is counted as paid this month. Edge case: the `findPaidCustomerIdsForMonth` query may only check `billing_month = this month`. **File a finding if multi-month customers appear unpaid in months 2/3** |
| 8.11 | Non-regular excluded from unpaid | Tenant has 100 non-regular customers with no current-month payment | unpaidThisMonth ignores them. Hero `paidCustomers` calc still subtracts only regular unpaids — confirm formula matches spec |
| 8.12 | Currency soft-deleted | Tenant soft-deletes LBP. Payments in LBP exist | Snapshot conversion still works (snapshot is on the payment, not the currency). Display formatting may show the (now-inactive) currency label — verify gracefully |
| 8.13 | RTL display | Switch to Arabic | Layout mirrors; numbers use locale formatting |
