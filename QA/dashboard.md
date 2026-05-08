# Dashboard — QA Scenarios

Covers the admin dashboard metrics: monthly revenue, active customer count, paid/unpaid this month, total customers/users/plans. Admin-only, reached from Admin tab → Dashboard.

**Reference code:**
- Screen: [DashboardScreen.tsx](SubsTrack/src/modules/dashboard/screens/DashboardScreen.tsx)
- Service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Store: [dashboardStore.ts](SubsTrack/src/modules/dashboard/store/dashboardStore.ts)
- Admin home (compact stats card): [admin/index.tsx](SubsTrack/app/(app)/(tabs)/admin/index.tsx)

---

## 1. Greeting and date

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Greeting | Open Dashboard | "Hello, <username>" |
| 1.2 | Username with capitals | Username = "alice" | Renders as "alice" (no transform) |
| 1.3 | No user | (Cannot happen — gated by AppLayout) | Should not render this screen |
| 1.4 | Date label | Sub-title under greeting | Today's weekday + month + day, e.g. "Friday, May 8" |
| 1.5 | Locale | App in English / Arabic | Date locale follows `en-US` (hard-coded). File a finding if Arabic must be applied |

## 2. Hero card — Monthly Collected

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Month label | Hero card top-left | Uppercase three-letter month + year, e.g. "MAY 2026 COLLECTED" |
| 2.2 | Amount | Look at the large number | Formatted currency (Intl `en-US` USD), e.g. "$1,250.00" |
| 2.3 | Sub-text | Below amount | "<paidCustomers> of <activeCustomers> active customers · <pct>% collected" |
| 2.4 | Paid customers calc | Paid = activeCustomers − unpaidThisMonth | Cannot go negative (`Math.max(0, ...)`); verify accuracy |
| 2.5 | Progress bar — full | All active customers paid | Bar at 100% width |
| 2.6 | Progress bar — empty | No active customers | Bar at 0%; division-by-zero handled (returns 0%) |
| 2.7 | Progress bar — partial | 4 of 10 paid | Bar at 40% |
| 2.8 | Voided payment excluded | Pay $100 then void it | monthly_revenue drops by $100; collected % drops accordingly |
| 2.9 | Inactive customer with payment | Inactive customer paid current month (e.g. arrears) | Their payment is included in monthly_revenue but `paidCustomers` calculation only considers actives. Verify behavior matches business rule |

## 3. Stat cards (Unpaid / New This Month)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Unpaid card | Look at left card | Red dot, "UNPAID" label, count of active customers without a non-voided payment in current month |
| 3.2 | "New This Month" label | Look at right card | Green dot, "NEW THIS MONTH" label, value = totalCustomers (NOT a true "new this month" count) — this is a **labeling discrepancy** vs the metric. Verify intent and file a finding |
| 3.3 | Empty tenant | Zero customers | Both cards show 0 |
| 3.4 | Zero unpaid | All actives paid | Unpaid = 0 |

## 4. Loading and refresh

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | First open — no metrics yet | Tab focus while metrics is null | ActivityIndicator at center, no stale numbers |
| 4.2 | Subsequent loads | After metrics exist | Hero/stats remain visible while fetching |
| 4.3 | Pull-to-refresh | Pull down | Spinner; values refresh |
| 4.4 | Refresh on focus | Leave tab and return | `fetchMetrics` re-runs |
| 4.5 | Network error | Disable net, refresh | ErrorBanner shown above the hero. Existing values preserved |
| 4.6 | Concurrent updates | Pay a customer in another session, then refresh dashboard | Hero amount and Paid count update to new values |

## 5. Multi-tenancy

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Tenant A metrics | Login to A | Numbers reflect ONLY tenant A data |
| 5.2 | Tenant B metrics after re-login | Logout, login as B | Numbers reflect tenant B data only; no flash of A's numbers (stores reset on logout) |
| 5.3 | Inactive tenant | Login forces TenantInactiveScreen | Dashboard never renders |

## 6. Permissions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | User role | Login as user | Admin tab not present, Dashboard not reachable from UI |
| 6.2 | Admin role | Login as admin | Dashboard reachable from Admin → Dashboard |

## 7. Admin home compact stats card

The Admin tab landing screen has its own compact summary that shares the dashboard store.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Compact "Collected" cell | Look at top-left of the stats card | Compact format: `$1.2k` for ≥1000, `$30` for <1000 |
| 7.2 | Compact "Unpaid" cell | Middle | Red number = unpaidThisMonth |
| 7.3 | Compact "Customers" cell | Right | Total customer count |
| 7.4 | Loading state | First load | ActivityIndicator inside the Collected cell |
| 7.5 | Menu items | Below stats | Three rows: Dashboard, Staff (with member count), Plans (with plan count) |
| 7.6 | Member count subtitle | Staff row | "<N> members" — uses metrics.totalUsers |
| 7.7 | Plan count subtitle | Plans row | "<N> plans" — uses metrics.totalPlans |
| 7.8 | Navigation | Tap a menu row | Pushes the corresponding screen (Dashboard, Staff, Plans) |
| 7.9 | Refresh on focus | Switch tabs and return | Metrics refresh |

## 8. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Customer with payment but inactive | Active = false, has payment for current month | Counts: totalCustomers includes them; activeCustomers does not. Their payment counts in monthly_revenue |
| 8.2 | Customer paid future month, not current month | Pay June while in May | June payment does NOT appear in May's monthly_revenue. Customer remains "unpaid" for May |
| 8.3 | Two payments same customer different months | Customer paid March and April | Each month's metric isolates correctly when the dashboard is viewed in March vs April |
| 8.4 | Time zone day boundaries | Open dashboard at 23:59 vs 00:01 | "Current month" computed via `getCurrentYearMonth()` using local time. Verify there is no flicker or double-counting at midnight |
| 8.5 | Voided payment in current month | Void today's payment | unpaidThisMonth +1, monthlyRevenue -amount, paidCustomers -1 |
| 8.6 | Many customers (perf) | 5000 customers | unpaid count uses two queries + JS Set diff; verify load time |
| 8.7 | Failed parallel fetch | One of the 6 parallel queries fails | Promise.all rejects → ErrorBanner. Existing displayed values preserved |
| 8.8 | Currency locale | Switch app to Arabic | formatCurrency still uses 'en-US' (hard-coded). File whether Arabic numerals expected |
| 8.9 | "New This Month" wording vs value | Re-read 3.2 | Confirm whether the displayed metric matches the label "New This Month" or is intentionally totalCustomers |
