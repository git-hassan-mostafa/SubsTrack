# Reports — QA Scenarios

Covers the **Reports** bottom tab (admin-only): the period picker, the Money and Debts sections, drill-downs and CSV export. The underlying numbers are owned by other areas — money in by [payments.md](payments.md) / [sales.md](sales.md) / [debts.md](debts.md), money out by [expenses.md](expenses.md), month status by [monthly-grid.md](monthly-grid.md).

**Reference code:**
- Service (composes existing services/repos): [ReportsService.ts](../SubsTrack/src/modules/reports/services/ReportsService.ts)
- Period primitive: [dateRange.ts](../SubsTrack/src/core/utils/dateRange.ts) · picker: [PeriodPicker.tsx](../SubsTrack/src/shared/components/PeriodPicker.tsx)
- Aggregation (pure): [aggregate.ts](../SubsTrack/src/modules/reports/utils/aggregate.ts)
- Screen: [ReportsScreen.tsx](../SubsTrack/src/modules/reports/screens/ReportsScreen.tsx)
- Sections: [MoneyReport.tsx](../SubsTrack/src/modules/reports/screens/sections/MoneyReport.tsx) · [DebtsReport.tsx](../SubsTrack/src/modules/reports/screens/sections/DebtsReport.tsx)
- Overdue ageing: `getOverdueMonthCounts` in [PaymentService.ts](../SubsTrack/src/modules/customer/customer-payments/services/PaymentService.ts)
- Export: [csv.ts](../SubsTrack/src/shared/lib/csv.ts) · [csvRows.ts](../SubsTrack/src/modules/reports/utils/csvRows.ts)

**Core rules under test:**
- Revenue is **cash collected**, never billed — so Reports and the dashboard must agree **to the cent** for one month.
- The period scopes the **cash**. Outstanding debt is **all time** (gotcha #91).
- Overdue ageing counts to **today**, and comes from the same month grid as the customer-list badges.
- Amounts convert via each row's **frozen** `rate_per_usd_snapshot`, never the live rate.
- Reports is **admin-only**; the tab is not in the tab bar for a collector.

> **This build cannot arrive over the air.** The CSV export uses native modules (`expo-file-system` + `expo-sharing`), so test on a fresh `npm run build-prod` install — an OTA update will silently not reach an older build.

---

## 1. Access & navigation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Admin sees the tab | Log in as `admin` | A 5th bottom tab "Reports" with a stats icon |
| 1.2 | Collector does not | Log in as `role = 'user'` | No Reports tab; the tab bar keeps 3 tabs and does not look broken |
| 1.3 | Route not reachable | As a collector, deep-link to `/reports` | Not reachable; no tenant money is shown |
| 1.4 | Tab icon pops to top | Scroll a section down, tap the Reports tab icon | Returns to the top of the page |
| 1.5 | Web refresh | On web, refresh while on `/reports` | The page rebuilds and the tab bar still works (`unstable_settings` anchor — gotcha #82) |
| 1.6 | Filter session survives | Pick "Last 6 months", go to Customers, come back | Still on Last 6 months, same section |
| 1.7 | Logout clears it | Pick a custom period, log out, log in as another tenant's admin | Period is back to "This month"; no previous tenant's figures ever appear |

## 2. Period picker

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Default | Open Reports | "This month" is selected; the caption shows the 1st → last day of the current month |
| 2.2 | Each preset | Tap each of This month / Last month / Last 3 / 6 / 12 months / This year | Each spans **whole calendar months**, ending on the last day of its final month; figures reload |
| 2.3 | Last 3 months includes this one | Tap Last 3 months in August | Range is 1 Jun → 31 Aug (3 buckets, not 4) |
| 2.4 | Custom range | Tap Custom | Two date chips appear, pre-filled with the current range |
| 2.5 | Custom crossing a year | Set 1 Nov (this year) → 28 Feb (next year) | 4 month buckets in order Nov · Dec · Jan · Feb; labels show the year |
| 2.6 | From cannot exceed To | In Custom, try to set From after To | The picker refuses (max/min bounds) |
| 2.7 | Last day is included | Record a payment at 23:50 on the last day of the period | It counts in this period, not the next |
| 2.8 | Switching sections keeps the period | Pick Last 6 months → switch to Debts | Debts loads for the same 6 months (no reset to this month) |

## 3. Money — the reconciliation test (**blocker**)

> This is the acceptance test. A mismatch means a filter or a snapshot conversion is wrong, not a display bug.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Collected = dashboard revenue | Period "This month", all branches → compare "Collected" with the Home hero total | Identical **to the cent** |
| 3.2 | Stream split matches | Compare Money-in breakdown with the hero's Subscriptions / Sales sub-line | Identical, and the three streams sum to Collected |
| 3.3 | Spent matches Expenses | Compare "Spent" with Transactions → Expenses total for the same month | Identical (includes the derived stock half) |
| 3.4 | Net | Check Net | Exactly Collected − Spent, matching the dashboard's Net line |
| 3.5 | Partial payment counts only its paid part | Record a partial payment of 30 of 50 | Collected grows by 30, not 50 |
| 3.6 | Partial sale likewise | Record a sale of 100 with 60 collected | Collected grows by 60 |
| 3.7 | Collecting an old debt lands in TODAY | Record a debt payment for a debt created months ago | It counts in the **current** period, not the debt's original month |
| 3.8 | Voided rows excluded | Void a payment inside the period, refresh | Collected drops by exactly that amount |
| 3.9 | Zero-amount slots ignored | A month with an unpaid (0) payment row | Contributes nothing and is not counted as a record |

## 4. Money — KPIs and breakdowns

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Comparison pill | Pick "Last month" with data in the month before | ▲/▼ pill with a % vs the previous period of the same length |
| 4.2 | Pill hides on zero base | Pick a period whose previous period had nothing | No pill at all (never "+∞%" or "+100%") |
| 4.3 | Spending colour is inverted | Spend more than the previous period | The Spent pill's arrow points **up** but is coloured **red** |
| 4.4 | Negative net | Make expenses exceed collections | Net renders in red |
| 4.5 | Margin | Check Margin | Net ÷ Collected as a %; shows "—" when nothing was collected |
| 4.6 | No charts anywhere | Scroll both sections | Only KPI tiles, breakdown rows with inline share bars, and lists — nothing is drawn |
| 4.7 | Breakdown shares | Check Money in / Money out | Percentages sum to 100%; a tiny non-zero row still shows a visible sliver |
| 4.8 | Expense categories | Have both a hand-typed expense and a costed restock | Both appear; the derived one under "Stock" |
| 4.9 | Empty period | Pick a period with no activity | "Nothing in this period" with a hint — no zeroed cards, no crash |
| 4.10 | Tile grid height (**Android**) | Open Money and Debts on a **real Android build**, then again on web | Two tiles per row, each card only as tall as its own label + value (never half the screen); the comparison pill sits right under its card. Both platforms look the same (gotcha #95) |
| 4.11 | Odd number of KPIs | (Dev) render a section with 3 KPIs | The lone third tile stays **half** width, left-aligned — it does not stretch across the row |

## 5. Money — currency

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Currency split | Collect in USD and LBP in the same period | One line per currency, each printed in its **own** currency, with a `≈` display-currency value beside the LBP line |
| 5.2 | Split sums to the headline | Add the `≈` values | Equals "Collected" |
| 5.3 | Frozen rates | After collecting in LBP, change the LBP rate in Admin → Currencies | Every historical figure on the report is **unchanged** |
| 5.4 | Display currency | Switch the tenant display currency | KPIs, breakdowns and the `≈` values reformat; the own-currency amounts do not |

## 6. Debts

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Still owed matches | Compare "Still owed" with the Transactions → Debts header and the dashboard debt tile | Identical |
| 6.2 | Still owed ignores the period | Switch from This month to Last 12 months | "Still owed", "Customers owing" and "Behind on payments" **do not change**; only "Collected on debts" moves |
| 6.3 | Captions present | Read the debt KPIs | "All time — not limited to the period", "In the selected period", and "Unpaid months, counted to today" under Behind on payments |
| 6.4 | Collected on debts | Record a debt payment today, period = This month | Grows by exactly that amount, and matches the Money section's "Debt collected" stream |
| 6.5 | Ageing matches the badges | Find a customer the customer list badges "Overdue" | They are inside "Behind on payments", and if they are a top debtor their row reads the right number of months |
| 6.6 | Distinct months, not per line | A customer with 3 plans, all 1 month behind | Counted as **1 month behind**, not 3 |
| 6.7 | Prepay gap is not a debt | A customer who paid Jul + Aug in August, with Sep–Nov uncovered | **Not** counted as behind (uncovered ≠ overdue — gotcha #81b) |
| 6.8 | Skipped months excused | Skip the current month for a customer | They do not appear as behind for that month |
| 6.9 | Not-due-yet excused | Tenant rule `customer_start_day`, a customer whose billing day has not arrived | Not counted as behind |
| 6.10 | Non-regular excluded | An occasional customer with an old unpaid month | Never counted as behind |
| 6.11 | Whole customer base | A tenant with more customers than one list page (>50) | "Behind on payments" covers **all** of them, not just the first page |
| 6.12 | Everyone up to date | Settle every customer | "Behind on payments" reads 0 in green; no debtor rows carry a months-behind line |
| 6.13 | Top debtors | Check the list | Sorted most-owed first, max 10, each with a "N months behind" sub-line where applicable |
| 6.14 | Debtor tap-through | Tap a debtor | Opens that customer's page |
| 6.15 | Category breakdown | Have partial payments, partial sales and a custom debt | Three categories appear; note they are **gross** and do not sum to the net "Still owed" |

## 7. Drill-down

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Records sum to the number | Add the amounts in the sheet | Equals the total shown at the top of the sheet, and the figure that was tapped |
| 7.2 | Tap a stream row | Tap "Sales" in Money in | Only sale rows, all in the period |
| 7.3 | Tap a category row | Tap "Stock" in Money out | Only stock-purchase rows |
| 7.4 | Own currency shown | A drill-down containing LBP rows | Each row prints in its own currency with a `≈` value |
| 7.5 | No second query | Turn off the network, then drill in | The sheet still opens with data (it filters rows already loaded) |
| 7.6 | Walk-in sale | A sale with no customer | Row shows the items summary instead of a blank name |
| 7.7 | Close | Drag down / Back / Close | Sheet closes, no discard prompt (nothing is editable) |

## 8. Branches

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Chip rescopes | Switch the header branch chip | Every KPI, breakdown and list reloads for that branch |
| 8.2 | Branches sum to the total | As a tenant-wide admin, note each branch's Collected + Unassigned, then All branches | The parts **sum** to the whole. A branch exceeding the total means a shared row is double counted (gotcha #88) |
| 8.3 | Company-wide expenses | Record an expense with no branch | Appears only in All branches, never inside a branch |
| 8.4 | Shared product restock | Restock a SHARED product with a cost | Its cost appears only in All branches |
| 8.5 | Branch admin | Log in as an admin bound to one branch | Sees only their branch; the chip cannot reach another |
| 8.6 | Ageing rescopes | Switch branch | "Behind on payments" only counts that branch's customers |

## 9. Export (CSV)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Money export (Android) | Money section → header download icon | System share sheet appears with a `.csv` |
| 9.2 | Opens correctly | Open the file in Excel / Google Sheets | Columns are Date · Type · Customer · Detail · Amount · Currency · USD |
| 9.3 | Sums to Net | Sum the USD column | Equals the report's Net (spending rows are negative) |
| 9.4 | Comma-safe | Have a customer named `Smith, John` | Stays in one cell — not split across two |
| 9.5 | Arabic-safe | Switch to Arabic and export | Arabic names render correctly in Excel (UTF-8 BOM), not as mojibake |
| 9.6 | Debts export | Debts section → export | Customer · Months behind · Owed (USD), worst first |
| 9.7 | Filename | Check the file name | Contains the report name and the period's from/to dates |
| 9.8 | Web | On web, export | The file downloads through the browser (no share sheet) |
| 9.9 | Nothing to export | Empty period | The export button is not offered |

## 10. Offline (native)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Reads work offline | Airplane mode → open Reports | Same figures as online for already-synced data; no error banner |
| 10.2 | Every section | Switch to Debts offline | Loads, including "Behind on payments" and the debtor list |
| 10.3 | Local write appears | Offline, record a payment → return to Reports | It is included in the current period |
| 10.4 | Survives sync | Reconnect, let sync run, refresh Reports | Same figure, still inside the same period — no duplicate, no shift |
| 10.5 | Parity | Compare the same period online (web) and offline (native) | Identical totals |

## 11. Arabic / RTL

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Numbers not mirrored | Switch to Arabic → Money section | Amounts and percentages read normally, not reversed |
| 11.2 | Layout | Scan every card | Nothing overlaps; the share bars grow from the correct side |
| 11.3 | Tab bar fits | Look at the 5-tab bar with Arabic labels | All 5 labels fit without truncation |
| 11.4 | Period chips | Scroll the preset chips | Scroll direction and order follow RTL |

## 12. Errors, loading & performance

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Loading | Pick a 12-month period | A spinner, then the report — no half-drawn cards |
| 12.2 | Error banner | Force a failure (revoke network mid-fetch on web) | Inline `ErrorBanner`, never an alert; dismissible |
| 12.3 | Pull to refresh | Pull down | Re-fetches the current section |
| 12.4 | Fast switching | Change the period 4–5 times quickly | The **last** choice wins; an older answer never overwrites it |
| 12.5 | Branch + period race | Change branch and period almost together | Figures match the final combination |
| 12.6 | Large tenant | A tenant with 12 months of heavy data | The 12-month report loads in a reasonable time (it issues one query per stream, not per month) |
