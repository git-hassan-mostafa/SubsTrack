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
- Display currency setting: [useTenantSettingSlice.ts](SubsTrack/src/state/hooks/useTenantSettingSlice.ts) (`useDisplayCurrencyId`)

---

## 0. Critical invariants

1. **Aggregates are USD-converted via snapshots.** `DashboardService.getMetrics()` fetches `{amount_paid, rate_per_usd_snapshot}` rows for the current billing month and divides each by its snapshot before summing. The total is then formatted in the user's display currency.
2. **Revenue is CASH COLLECTED, not billed.** `monthlyRevenue = subscriptionRevenue + salesRevenue + debtRevenue` — `payments.amount_paid` + `sales.amount_paid` + `debt_payments.amount`, each scoped by when the money arrived (`paid_at` / `sold_at`), summed in USD via `rate_per_usd_snapshot` and formatted in the display currency. A partial payment/sale contributes **only its paid part**; the remainder is a debt that enters revenue in the month it's collected. Every collected amount counts exactly once. The hero's breakdown sub-line lists **only Subscriptions and Sales** — `debtRevenue` counts in the headline but is intentionally not shown, because the card's one debt figure is the owed chip.
3. **Voided payments, sales, and debt payments are excluded** from monthly_revenue and from the "paid customers" count.
4. **Non-regular customers are excluded** from `unpaidThisMonth` and the unpaid customer count on the hero.
5. **Branch-aware metrics.** When BranchSelector is set to a specific branch, all metrics scope to that branch (plans include shared).
6. **Promise.all parallelism.** `getMetrics()` fires subscription payment queries, the sales total query, the debt-payment total query, and customer count queries in parallel. One failure rejects the whole batch.

---

## 1. Greeting and date

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Greeting | Open Dashboard | "Hello, <username>" |
| 1.2 | Username capitalization | Username = "alice" | Renders as "alice" (no transform) |
| 1.3 | Date label | Sub-title under greeting | Today's weekday + month + day |
| 1.4 | Locale | App in English / Arabic | Date follows active locale (verify — file a finding if hardcoded en-US) |

### 1b. Header row — greeting + branch chip + quick actions

The home greeting is one row, matching `PageHeader` on every other screen: name on the leading edge, branch chip and the 3-dot quick-actions menu on the trailing edge.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1b.1 | One line | Tenant-wide admin, multi-branch org, open Home | The greeting, the branch chip and the 3-dot button are all on the **same** row — the chip is no longer on its own second line |
| 1b.2 | Long name | A user with a very long full name | The name truncates with an ellipsis; the chip and 3-dot stay fully visible and never wrap |
| 1b.3 | No branch chip | Branch-bound user, or a single-branch org | The chip is hidden; the greeting and the 3-dot still sit on one row with no gap left behind |
| 1b.4 | Quick actions open | Tap the 3-dot on Home | The same menu as every other screen: Payments history / Add customer / Record sale / Add custom debt / Record debt payment (+ Batch restock for admins) |
| 1b.5 | Non-admin menu | As `user`, tap the 3-dot on Home | **Batch restock** is absent; every other entry is present |
| 1b.6 | Each action works | Open each menu entry in turn | Each opens its sheet (hosted by `QuickActionSheets`) and the dashboard refreshes where relevant |
| 1b.7 | Tiles still work | The "Add customer" and "Record sale" tiles below the greeting | Both still open their forms — the menu is additional, not a replacement |
| 1b.8 | Branch chip works | Pick a different branch from the chip | The dashboard metrics refetch for that branch |
| 1b.9 | Scrolls with content | Scroll the dashboard down | The header row scrolls away with the content (it is inside the ScrollView, not pinned) |
| 1b.10 | RTL | Switch to Arabic | The name sits on the right, the chip and 3-dot on the left; nothing overlaps |
| 1b.11 | Menu matches PageHeader | Compare the Home 3-dot menu with the Transactions tab's | Identical entries and order (one shared component) |

## 2. Hero card — Monthly Collected (USD-converted, display-currency formatted)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Month label | Top-left of hero | Uppercase three-letter month + year (e.g. "MAY 2026 COLLECTED") |
| 2.2 | Amount | Big number | Cash collected this calendar month across the three streams, each row `/ rate_per_usd_snapshot`, formatted in the user's display currency |
| 2.3 | Mixed currency totals | Pay $50 (USD) + 50,000 LBP (snapshot rate 50,000) | Both → 1 USD each → $2.00 (or LBP equivalent if display=LBP) |
| 2.4 | Sub-text | Below amount | "<paidCustomers> of <dueThisMonth> customers paid" + `<pct>%` — the population **billed this month**, not every active customer (see §3b) |
| 2.4a | Breakdown sub-line — visible | Month has both subscription and sales revenue | Secondary line beneath the amount: Subscriptions and Sales with their amounts in display currency, a thin divider between them |
| 2.4b | Breakdown sub-line — hidden | Only one of the two earned (e.g. subscriptions only) | Sub-line NOT rendered — it would just repeat the hero total |
| 2.4c | **Collected debts never listed** | Month has debt collections | The breakdown shows **only** Subscriptions and Sales — no "Debts collected" column, by design. The collected amount is still inside the big number |
| 2.4c2 | Breakdown may not equal the headline | Month has payments + sales + debt collections | `Subscriptions + Sales < headline`; the gap equals `debtRevenue`. **This is intended, not a bug** — the card shows owed debt instead of collected debt |
| 2.4d | Sales-only revenue | Tenant records a paid sale, no subscription payment | Hero shows the sale's paid amount; sub-line NOT rendered (one stream) |
| 2.4d2 | Debt-collection-only month | Only a debt payment this month, no payments or sales | Headline = the collected amount; sub-line NOT rendered (neither listed stream earned) |
| 2.4e | Owed-debt chip visible | Any customer still owes money (`totalDebt > 0`) | Red-tinted chip (`bg-red-400/20`) below the breakdown, above the divider: "Owed by customers" + the amount with a leading minus, e.g. `−$383.00`. Chip hugs its content, does NOT stretch full width |
| 2.4f | Owed-debt chip hidden | Nobody owes anything | Chip NOT rendered |
| 2.4g | Chip is money OUT | Compare chip to the big number | The chip amount is NOT part of the hero total — it is money never collected. Nothing in the card adds up to include it |
| 2.4h | Only one debt figure in the card | Month has both collected debts and outstanding debt | The card shows **only** the owed chip. Collected debt has no column, so two debt numbers can never appear together here |
| 2.4i | Collecting a debt moves both | Record a debt payment | The headline total goes up and the red chip goes down, by the same amount |
| 2.4j | Chip matches the tile + Debts tab | Compare chip amount to the total-debt tile and Transactions → Debts header | All three identical (`totalDebt`) |
| 2.4k | Chip RTL | Switch to Arabic | Chip mirrors; label "مطلوب من العملاء", minus stays attached to the amount |
| 2.5 | Paid customers calc | Paid = activeCustomers − unpaidThisMonth (regular only) | Cannot go negative |
| 2.6 | Progress bar — full | All active regulars paid | Bar at 100% width |
| 2.7 | Progress bar — empty | No active customers | Bar at 0%; division-by-zero handled |
| 2.8 | Progress bar — partial | 4 of 10 paid | 40% |
| 2.9 | Voided payment excluded | Pay $100 subscription then void | monthly_revenue drops by $100; collected % drops accordingly |
| 2.9a | Voided sale excluded | Record $50 sale (fully paid) then void it | monthly_revenue drops by $50; salesRevenue in sub-line drops |
| 2.9b | Voided debt payment excluded | Record a $30 debt payment then void it | monthly_revenue drops by $30; debtRevenue drops; the customer's debt goes back up |
| 2.14 | Partial sale counts only cash | Sell $100, collect $30 | salesRevenue = **$30** (not $100); the remaining $70 appears under Debts, not revenue |
| 2.15 | Collecting that debt raises revenue | Then record a $70 debt payment | monthly_revenue +$70 via debtRevenue; the sale's own row is untouched; the $100 has now been counted exactly once across the two months |
| 2.16 | Partial payment counts only cash | $100 due, collect $40 | subscriptionRevenue = $40; the $60 sits in Debts; collecting it later adds $60 to debtRevenue |
| 2.17 | Fully unpaid sale adds no revenue | Sell $100, collect $0 | salesRevenue unchanged ($0 added); salesCount still +1; the $100 shows as a Sales debt |
| 2.18 | Debt collected in a later month | Partial sale in May, debt paid in June | May revenue holds only the May cash; June revenue holds the collected debt. Neither month double-counts |
| 2.19 | Revenue vs wallet agree | Compare a collector's day of work to their wallet | The same three sources (payments / sales / debt payments) and the same `amount_paid` figures feed both, so unremitted cash is always a subset of the collected revenue |
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
| 3.6 | Not-due-yet excluded | `customer_start_day` rule; a line whose start day-of-month hasn't arrived yet, unpaid | Unpaid does NOT count them — the tile agrees with the grid's grey "not due yet" cell and the card's "Not due yet" badge |
| 3.7 | Skipped excluded | A line with this month skipped | Unpaid does NOT count them |
| 3.8 | Rule respected | Same unpaid line under `month_start` | Unpaid DOES count them (the rule only spares the current month under `customer_start_day`) |

## 3b. Collection progress (the % bar)

Measured against **`dueThisMonth`** — the customers this month actually bills — never `activeCustomers`. `dueThisMonth` already drops non-regular, not-yet-started, skipped, and not-due-yet customers, so the bar can reach 100% whenever there is nothing left to collect. Same one pass as the Unpaid tile, so the two can never disagree.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3b.1 | Not-due-yet reaches 100% | 30 active regulars: 29 paid, 1 not due yet (`customer_start_day`, billing day not arrived) | **100%**, caption "29 of 29 customers paid" — the not-due-yet customer is in neither number |
| 3b.2 | Skipped reaches 100% | All due customers paid, one has this month skipped | 100%; the skipped customer is not in the denominator |
| 3b.3 | Occasional customers ignored | Tenant has active non-regular customers, every regular paid | 100% (they never owe a month) |
| 3b.4 | Not-yet-started ignored | A line starting next month, unpaid | Not in the denominator; bar unaffected |
| 3b.5 | Genuine unpaid still shows | 30 due, 29 paid, 1 truly unpaid this month | 97%, caption "29 of 30 customers paid" |
| 3b.6 | Nothing due | Every customer is skipped / not due yet / occasional | 100% (not 0%) — nothing to collect reads as fully collected |
| 3b.7 | Billing day arrives | Not-due-yet customer's start day passes, refresh | They enter both the denominator and Unpaid; bar drops accordingly |
| 3b.8 | Agrees with the Unpaid tile | Any state | `due − paid` shown in the caption always equals the Unpaid tile's count |
| 3b.9 | Rule change applies at once | Admin switches the rule in Tenant Settings, refresh dashboard | Bar and Unpaid tile recompute under the new rule (read at call time, never cached) |
| 3b.10 | Branch-scoped | Pick a branch | Both numbers scope to that branch |
| 3b.11 | Offline parity (native) | Go offline, open dashboard | Same percentage and caption as online for synced data (both repositories run the same rule) |

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
| 8.15 | Walk-in sale (no customer) | Record fully-paid sale with customer = null | The collected amount is included in salesRevenue and monthly_revenue. A walk-in sale cannot be partial (no customer to owe the debt) |
| 8.16 | Sales from this month vs last month | Record sale in previous billing month | Previous month's sale does NOT appear in current month's salesRevenue |
| 8.8 | Partial payment effect | Customer paid 50/100 for current month | Customer counted as PAID (their `paid_at` exists, not voided, `amount_paid > 0`). monthly_revenue includes the 50 — **not** the 100 |
| 8.17 | Debt payment with no source row edit | Collect a $70 debt | debtRevenue +$70. The original partial payment/sale row is NOT modified, so its month's revenue never changes retroactively |
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

`RevenueTrendChart` renders the **6 months ending on the current month** as a row of 6 stacked vertical bars; each bar splits subscription (indigo, bottom) / sales (emerald) / debt payments (red, top — matching the Debts tab's `COLORS.danger`). The current month is emphasized (primary color + value label above it). Prev/next chevrons — or a horizontal swipe anywhere on the card (`useHorizontalSwipe`) — page the window 6 months at a time, capped at the current month.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Six bars | Open dashboard | Exactly 6 bars ending on the current month, month labels below (localized short names, shrunk to fit one row); bars fill their columns with a small gap between |
| 10.2 | Current highlighted | Current month's bar | Its subscription segment is primary color + its total shown above it; other months' subscription segments muted (indigo-200) |
| 10.3 | Stacked mix | Month has payments, sales, and a collected debt | Bar splits three ways: indigo subscription (bottom) + emerald sales + red debt (top); total height = combined USD; the segments sum exactly to the bar height (subscriptions absorb rounding) |
| 10.3a | Debt color matches Debts tab | Compare the debt segment / legend swatch to a Debts-tab row | Same red (`COLORS.danger`, `#ef4444`) |
| 10.4 | Legend | Window has any sales or any debt payments | Legend shows above the plot listing only the streams present (Subscriptions always, plus Sales and/or Debts); hidden entirely when the window is subscriptions-only |
| 10.4a | Chart total matches hero | Compare the current-month bar's label to the hero amount | Identical — both are the same three cash streams over the same calendar month |
| 10.5 | Bar heights | Months with different revenue | Tallest bar = the max month; others scaled proportionally |
| 10.6 | Empty / future month | A month with zero revenue (incl. months later than the current one) | Bar renders a minimal sliver (not invisible), not a divide-by-zero |
| 10.7 | All-zero tenant | No revenue in any month | All bars at min height; no crash; no value labels |
| 10.8 | Every revenue month labeled | Several months have revenue | Each month with `total > 0` shows its amount above the bar (current month in primary, others in gray); zero months show no label |
| 10.9 | Snapshot immunity | Old month paid in LBP; admin later edits LBP rate | That month's bar keeps its original USD height (per-row `rate_per_usd_snapshot`) |
| 10.10 | Display currency | Switch USD → LBP | Value labels reformat to display currency |
| 10.11 | Voided excluded | Void a payment / sale / debt payment from a prior month | That month's bar shrinks accordingly on refresh |
| 10.12 | Branch-scoped | Pick a branch | All 6 bars scope to that branch |
| 10.13 | Year rollover | Open in January | The window spans Aug–Jan across two calendar years; month labels add a 2-digit year suffix for the months outside the current year |
| 10.14 | Swipe paging | Swipe the card right→left, then left→right | First flick pages to the newer window, second back to the older one — same result as the chevrons; a vertical drag still scrolls the dashboard |
| 10.15 | Swipe capped | Swipe toward newer while already on the current month | Nothing happens (same cap as the disabled next chevron) |
| 10.16 | RTL chevrons | Switch to Arabic | The back chevron (now on the right) points right and the forward chevron points left; both still page the same way, and a swipe matches the on-screen arrows |

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

## 13. Total debt tile

Only rendered when `totalDebt > 0`. The headline is the **net** debt still owed across **all** customers and categories, all-time — **the only figure on the dashboard that is not month-scoped**. Same underlying number as the Debts tab header (`DebtService.getDebtsView().summary.netUsd`).

Sub-line = `dashboard.debt_breakdown` → "Months {{monthsDebt}} · Sales {{salesDebt}}", both **gross** (before debt payments).

**The sub-line does NOT add up to the headline, and that is accepted, not a bug.** The headline is net (debt payments already subtracted); the two parts are gross and omit the `custom` + `services` categories, so they can read *larger* than the headline. A reconciling version was built and deliberately reverted at the owner's request — **don't file this as a defect.**

The same `totalDebt` figure also appears as the hero card's red "Owed by customers −X" chip (see 2.4e–2.4k).

**Do not confuse the tile or the chip with debt collected** — both are debt still **owed** (all-time). Collected debt is folded into the hero's headline total and has no column of its own.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | Hidden when zero | No debt in any category, any month | Tile NOT rendered |
| 13.2 | Shown with balance | Customer paid 50/100 this month | Tile shows the net owed (warning color), sub "Months $X · Sales $Y" |
| 13.2a | Parts exceed the headline | Tenant with past debt payments | Months + Sales > headline. **Expected** — gross parts vs a net total |
| 13.3 | Snapshot immunity | Partial payment in LBP; admin edits LBP rate | Balance keeps original USD equivalent |
| 13.4 | Display currency | Switch display currency | Tile and both sub-line parts reformat |
| 13.5 | Full-width | Any state where shown | Tile spans the row (single StatTile in a flex-row) |
| 13.6 | Not month-scoped | Partial payment from a prior month, none this month | Tile still shows that older debt |
| 13.7 | Sales debt included | Record a partially-paid sale | Sub's "Sales" figure increases; headline increases too |
| 13.8 | Debt payment reduces total | Record a debt payment for a debtor | Headline (net) drops; the months/sales sub-line (gross) is unchanged |
| 13.9 | Custom debt raises total only | Add a custom debt | Headline increases; the sub-line does not mention it (custom is not one of the two parts shown) |
| 13.10 | Matches the Debts tab | Compare tile headline to Transactions → Debts header | Identical |
| 13.11 | Credit customer | A customer whose payments exceed their debt (net credit) | The tenant headline nets that credit in, exactly as the Debts tab does |
| 13.12 | Branch-scoped | Pick a branch | Headline and both parts scope to that branch |

## 14. Offline parity (native)

The three new range queries run against the local SQLite mirror when offline.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 14.1 | Offline trend | Go offline (native), open dashboard | Current-year (Jan–Dec) trend, growth, and activity tiles render from the local mirror (same numbers as online for synced data) |
| 14.2 | Offline then sync | Record payments offline, reconnect | After sync, dashboard on another device shows the same trend/counts |
| 14.3 | Parity | Compare the same tenant/branch on web vs native | Trend buckets, new/cancelled counts, payments/sales counts match |
| 14.4 | Offline wallet tile | Go offline (native), open dashboard as admin | Cash in Wallets tile computes from the local mirror (matches online for synced data) |

## 15. Cash in Wallets tile (collector wallets)

Only rendered for **admins** and only when `walletCash > 0` — the net USD total of cash collectors have collected but not yet handed over (`walletService.getWalletsView`, summed). Sub-line reads "{collectors} collectors · {transactions} transactions". Placed just above the Total debt tile. Note this is a **third** distinct money meaning on the same screen: collected-and-still-in-a-pocket, versus the revenue card (collected, period) and the debt tile (never collected).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 15.1 | Hidden when empty | Every collector has handed over their cash (or none collected) | Tile NOT rendered |
| 15.2 | Shown with cash | A collector holds unremitted cash | Tile shows the net USD total (primary color, wallet icon), sub "N collectors · M transactions" |
| 15.3 | Non-admin never sees it | Login as a `user` role | Tile absent; the aggregate is not even computed (`includeWallet = false`) |
| 15.4 | Matches Wallets screen | Compare tile total with Admin → Wallets grand total | Same figure (both from `getWalletsView`, same branch scope) |
| 15.5 | Drops after receive | Admin receives all cash from a collector, then refresh dashboard | Tile total and counts drop by that collector's amount; tile disappears when total hits 0 |
| 15.6 | Snapshot immunity | Cash collected in LBP; admin later edits LBP rate | Tile keeps the original USD equivalent (per-row `rate_per_usd_snapshot`) |
| 15.7 | Display currency | Switch display USD → LBP | Tile reformats to display currency |
| 15.8 | Branch-scoped | Tenant-wide admin picks a branch | Tile scopes to that branch's collectors/cash |
| 15.9 | Void after handover (negative) | A received payment is voided so a collector's wallet goes negative | Net total can drop; if the branch net is ≤ 0 the tile hides (only shows when `walletCash > 0`) |
