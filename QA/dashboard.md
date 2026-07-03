# Dashboard — QA Scenarios

Covers the admin dashboard metrics: monthly revenue (USD-converted via payment snapshots, formatted in the user's display currency), active customer count, paid/unpaid this month, total customers/users/plans. It also covers the expanded home analytics: month-over-month revenue pill, 6-month revenue trend chart, this-month growth (new / cancelled customers), this-month activity (payments recorded + avg, sales recorded), and the outstanding-balance tile. Admin-only, reached from Admin tab → Dashboard.

The compact stats card on the Admin landing screen also surfaces a subset of these metrics.

**Reference code:**
- Screen: [DashboardScreen.tsx](SubsTrack/src/modules/dashboard/screens/DashboardScreen.tsx)
- Service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Components: [StatTile.tsx](SubsTrack/src/modules/dashboard/components/StatTile.tsx), [RevenueTrendChart.tsx](SubsTrack/src/modules/dashboard/components/RevenueTrendChart.tsx)
- Slice: [dashboardSlice.ts](SubsTrack/src/state/slices/dashboard/dashboardSlice.ts)
- Range queries: `paidAmountsInRange` (payment repo), `totalsInRange` (sale repo), `countCreatedInRange` / `countCancelledInRange` (customer repo) — each with a Supabase + Offline SQLite impl
- Admin home (compact stats card): [admin/index.tsx](SubsTrack/app/(app)/(tabs)/admin/index.tsx)
- Currency conversion: [currency.ts](SubsTrack/src/core/utils/currency.ts)
- Display currency preference: [uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts)

---

## 0. Critical invariants

1. **Aggregates are USD-converted via snapshots.** `DashboardService.getMetrics()` fetches `{amount_paid, rate_per_usd_snapshot}` rows for the current billing month and divides each by its snapshot before summing. The total is then formatted in the user's display currency.
2. **Revenue combines subscription payments AND one-off sales.** `monthlyRevenue = subscriptionRevenue + salesRevenue`. Both are summed in USD via `rate_per_usd_snapshot` and then formatted in the user's display currency. The hero card sub-line "Subscriptions: $X · Sales: $Y" is rendered when `salesRevenue > 0`.
3. **Voided payments and voided sales are excluded** from monthly_revenue and from the "paid customers" count.
4. **Non-regular customers are excluded** from `unpaidThisMonth` and the unpaid customer count on the hero.
5. **Branch-aware metrics.** When BranchSelector is set to a specific branch, all metrics scope to that branch (plans include shared).
6. **Promise.all parallelism.** `getMetrics()` fires subscription payment queries, sales total query, and customer count queries in parallel. One failure rejects the whole batch.

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
| 2.4a | Sales sub-line — visible | Month has any non-voided sales | Secondary line beneath the amount: "Subscriptions: $X · Sales: $Y" (both formatted in display currency) |
| 2.4b | Sales sub-line — hidden | Month has zero sales (salesRevenue = 0) | Sub-line NOT rendered; only the amount shown |
| 2.4c | Sales-only revenue | Tenant records a sale but no subscription payment this month | Hero shows the sale amount; subscriptions = $0 sub-line NOT shown (salesRevenue > 0 but subscriptionRevenue = 0) |
| 2.5 | Paid customers calc | Paid = activeCustomers − unpaidThisMonth (regular only) | Cannot go negative |
| 2.6 | Progress bar — full | All active regulars paid | Bar at 100% width |
| 2.7 | Progress bar — empty | No active customers | Bar at 0%; division-by-zero handled |
| 2.8 | Progress bar — partial | 4 of 10 paid | 40% |
| 2.9 | Voided payment excluded | Pay $100 subscription then void | monthly_revenue drops by $100; collected % drops accordingly |
| 2.9a | Voided sale excluded | Record $50 sale then void it | monthly_revenue drops by $50; salesRevenue in sub-line drops |
| 2.10 | Live currency rate change does NOT shift hero | Pay 50000 LBP at rate 50000 (= $1). Admin then edits LBP rate to 100000 | Hero still shows $1 from that payment (uses snapshot, not live rate) |
| 2.11 | Display currency change | Switch display from USD to LBP | Hero immediately reformats (re-renders), still based on USD-aggregated total |
| 2.12 | Inactive customer with current-month payment | Inactive customer paid this month (arrears) | Their amount is INCLUDED in monthly_revenue (revenue is collection-based). But they are NOT counted in active/paid customers (which uses `active = true`) |
| 2.13 | Branch-scoped hero | Tenant-wide admin picks Beirut | Only Beirut customer payments included |

## 3. Stat grid (Active / Unpaid / New / Cancelled / Payments / Sales)

The old two-card row was replaced by a 3×2 grid of shared `StatTile`s. Each tile: uppercase label, leading icon, big value, sub-line.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Unpaid tile | Row 1 right | "UNPAID" label (danger color), count of active REGULAR customers without a non-voided payment in current month, sub "customers this month" |
| 3.1a | Active tile | Row 1 left | "ACTIVE CUSTOMERS" value = activeCustomers, sub "of <totalCustomers> total" |
| 3.3 | Non-regular excluded | Tenant has active non-regular customers with no current-month payment | Unpaid count does NOT include them |
| 3.4 | Empty tenant | Zero customers | Every tile shows 0 |
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
| 8.7 | Failed parallel fetch | One of the parallel queries fails | Promise.all rejects → ErrorBanner. Existing values preserved |
| 8.14 | Sales snapshot immunity | Record $50 walk-in sale in LBP at rate 90000 (≈ $0.56). Admin edits LBP rate to 100000. Open dashboard | Hero still shows the original USD equivalent (uses `rate_per_usd_snapshot` on the sale row) |
| 8.15 | Walk-in sale (no customer) | Record sale with customer = null | Sale is included in salesRevenue and monthly_revenue |
| 8.16 | Sales from this month vs last month | Record sale in previous billing month | Previous month's sale does NOT appear in current month's salesRevenue |
| 8.8 | Partial payment effect | Customer paid 50/100 for current month | Customer counted as PAID (their `paid_at` exists, not voided, `amount_paid > 0`). monthly_revenue includes the 50 |
| 8.9 | Multi-month payment effect | Customer pays Jan–Mar in Jan | Only the source month (Jan) is in monthly_revenue. Feb and Mar dashboards (when viewed in Feb/Mar) will NOT show that payment in their monthly_revenue — but the customer is counted as PAID via the coverage map |
| 8.10 | "Paid this month" via multi-month coverage | Look at Feb dashboard, customer is covered by a Jan–Mar bundle | Verify customer is counted as paid this month. Edge case: the `findPaidCustomerIdsForMonth` query may only check `billing_month = this month`. **File a finding if multi-month customers appear unpaid in months 2/3** |
| 8.11 | Non-regular excluded from unpaid | Tenant has 100 non-regular customers with no current-month payment | unpaidThisMonth ignores them. Hero `paidCustomers` calc still subtracts only regular unpaids — confirm formula matches spec |
| 8.12 | Currency soft-deleted | Tenant soft-deletes LBP. Payments in LBP exist | Snapshot conversion still works (snapshot is on the payment, not the currency). Display formatting may show the (now-inactive) currency label — verify gracefully |
| 8.13 | RTL display | Switch to Arabic | Layout mirrors; numbers use locale formatting |

## 9. Hero — month-over-month pill

`momPct = round((monthlyRevenue − prevMonthRevenue) / prevMonthRevenue × 100)`, shown only when the previous month had revenue.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Growth | This month > last month revenue | Green pill with ▲ and the % (e.g. "▲ 12% vs last month") |
| 9.2 | Decline | This month < last month | Red pill with ▼ and the absolute % |
| 9.3 | No prior revenue | Previous month had $0 (or brand-new tenant) | Pill NOT rendered (avoids divide-by-zero / infinite %) |
| 9.4 | Flat | This month = last month | ▲ 0% (treated as non-negative) |
| 9.5 | Branch-scoped | Pick a branch | prevMonthRevenue is scoped to that branch too; pill reflects branch history |

## 10. Revenue trend chart

`RevenueTrendChart` renders every month of the **current year** (Jan → Dec) as a row of 12 stacked vertical bars; each bar splits subscription (indigo, bottom) vs sales (emerald, top). The current month is emphasized (primary color + value label above it).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Twelve bars | Open dashboard | Exactly 12 bars (Jan–Dec), month labels below (localized short names, shrunk to fit one row); bars fill their columns with a small gap between |
| 10.2 | Current highlighted | Current month's bar | Its subscription segment is primary color + its total shown above it; other months' subscription segments muted (indigo-200) |
| 10.3 | Stacked mix | Month has both payments and sales | Bar splits: indigo subscription segment (bottom) + emerald sales segment (top); total height = combined USD |
| 10.4 | Legend | Any month has sales | Legend (Subscriptions / Sales swatches) shows above the plot; hidden entirely when no month has sales |
| 10.5 | Bar heights | Months with different revenue | Tallest bar = the max month; others scaled proportionally |
| 10.6 | Empty / future month | A month with zero revenue (incl. months later than the current one) | Bar renders a minimal sliver (not invisible), not a divide-by-zero |
| 10.7 | All-zero tenant | No revenue in any month | All bars at min height; no crash; current month = last month with activity, else December |
| 10.8 | Every revenue month labeled | Several months have revenue | Each month with `total > 0` shows its amount above the bar (current month in primary, others in gray); zero months show no label |
| 10.9 | Snapshot immunity | Old month paid in LBP; admin later edits LBP rate | That month's bar keeps its original USD height (per-row `rate_per_usd_snapshot`) |
| 10.10 | Display currency | Switch USD → LBP | Value labels reformat to display currency |
| 10.11 | Voided excluded | Void a payment/sale from a prior month | That month's bar shrinks accordingly on refresh |
| 10.12 | Branch-scoped | Pick a branch | All 12 bars scope to that branch |
| 10.13 | January month-over-month | Open in January | Chart shows Jan–Dec of the current year; the vs-last-month pill treats December (last year, outside the window) as 0 revenue |

## 11. Growth tiles — New / Cancelled this month

`countCreatedInRange` (by `created_at`) and `countCancelledInRange` (by `cancelled_at`), both `[monthStart, monthEndExclusive)`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | New customers | Add 2 customers this month | "NEW CUSTOMERS" tile = 2 (success color), sub "joined this month" |
| 11.2 | Cancelled | Deactivate 1 customer this month | "CANCELLED" tile = 1, sub "left this month" |
| 11.3 | Prior-month create excluded | Customer created last month | Not counted in this month's New tile |
| 11.4 | Reactivate then no double count | Deactivate then reactivate this month | Cancelled reflects the last `cancelled_at` state; active customer (cancelled_at null) not counted as cancelled |
| 11.5 | Branch-scoped | Pick a branch | New/Cancelled counts scope to that branch (customers are branch-owned) |
| 11.6 | Includes non-regular | Add an occasional (non-regular) customer | Still counted in New (growth counts all customers, unlike unpaid) |

## 12. Activity tiles — Payments / Sales recorded + avg

`paymentsCollectedCount` = positive-amount non-voided payments this month; `salesCount` = non-voided sales this month; avg payment = `subscriptionRevenue / paymentsCollectedCount`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Payments count | Record 3 subscription payments this month | "PAYMENTS" tile = 3, sub "avg <amount> each" |
| 12.2 | Zero-amount slot not counted | An unpaid month slot (amount_paid = 0) | Not counted in paymentsCollectedCount; avg sub falls back to "This Month" |
| 12.3 | Avg calculation | Collect $30 + $50 + $100 over 3 payments | Avg = $60.00 each (display-currency formatted) |
| 12.4 | Voided payment | Void one of the payments | Count drops by 1; avg recomputes on refresh |
| 12.5 | Sales count | Record 2 sales this month | "SALES" tile = 2, sub "This Month" |
| 12.6 | Sales count excludes voided | Void one sale | Count drops by 1 |
| 12.7 | Branch-scoped | Pick a branch | Both counts + avg scope to that branch |

## 13. Outstanding balance tile

Only rendered when `totalOutstandingBalance > 0` (sum of current-month partial-payment `balance`, USD-converted).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | Hidden when zero | No partial payments this month | Tile NOT rendered |
| 13.2 | Shown with balance | Customer paid 50/100 this month | Tile shows the owed balance (warning color), sub "from partial payments" |
| 13.3 | Snapshot immunity | Partial payment in LBP; admin edits LBP rate | Balance keeps original USD equivalent |
| 13.4 | Display currency | Switch display currency | Tile reformats |
| 13.5 | Full-width | Any state where shown | Tile spans the row (single StatTile in a flex-row) |

## 14. Offline parity (native)

The three new range queries run against the local SQLite mirror when offline.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 14.1 | Offline trend | Go offline (native), open dashboard | Current-year (Jan–Dec) trend, growth, and activity tiles render from the local mirror (same numbers as online for synced data) |
| 14.2 | Offline then sync | Record payments offline, reconnect | After sync, dashboard on another device shows the same trend/counts |
| 14.3 | Parity | Compare the same tenant/branch on web vs native | Trend buckets, new/cancelled counts, payments/sales counts match |
