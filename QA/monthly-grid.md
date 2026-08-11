# Monthly Grid — QA Scenarios

The 12-cell grid is the core of the customer detail screen. Each cell encodes a month's status: PAID (green for regular / yellow for non-regular), SKIPPED (slate, both kinds), UNPAID (red for regular / light gray for non-regular), FUTURE (gray), or BEFORE_START (gray, slightly dimmer). **Multi-month payments** visually merge consecutive cells with a "Included" sublabel for months 2+. **Partial payments** (`amount_paid < amount_due`) render as a distinct `"partial"` status — amber cells, NOT an orange dot on a green cell.

The status logic lives in exactly one place: `PaymentService.buildMonthGrid`. Verify nothing else re-implements it.

**Reference code:**

- Service (logic): [PaymentService.buildMonthGrid](SubsTrack/src/modules/customer-payments/services/PaymentService.ts)
- Grid: [MonthGrid.tsx](SubsTrack/src/modules/customer-payments/components/MonthGrid.tsx)
- Cell: [MonthCell.tsx](SubsTrack/src/modules/customer-payments/components/MonthCell.tsx)
- Year navigator: [YearNavigator.tsx](SubsTrack/src/modules/customer-payments/components/YearNavigator.tsx)
- Customer panel (host): [CustomerPaymentPanel.tsx](SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx)
- Date utils: [date.ts](SubsTrack/src/core/utils/date.ts) · month due/late rules: [monthDueRules.ts](SubsTrack/src/modules/customer/customer-payments/utils/monthDueRules.ts)

---

## 1. Status truth table

For year Y, month M, given today = (CY, CM), customer.startDate = SY-SM-SD:

| Condition                                                                                                  | Status                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Y < SY OR (Y == SY AND M < SM)                                                                             | `before_start`                                                                                                     |
| A covering payment exists for Y-M AND `voided_at IS NULL` AND `amount_paid > 0` (ANY balance, incl. `balance > 0`) | `paid` (green for regular, yellow for non-regular; `isGroupSecondary = true` for months 2+ in a multi-month block) |
| An active skip exists for (line, Y-M) — `skipped_months.skipped = true`                                    | `skipped` (slate, same for regular and non-regular) — ranks BELOW `paid`                                            |
| Y > CY OR (Y == CY AND M > CM)                                                                             | `future`                                                                                                           |
| `UnpaidStartRule = customer_start_day` AND Y-M is the **current month** AND today's day-of-month < the line's start day (clamped to the month's length) | `future` — "not due yet"; grey but still fully payable. A **past** month is never held back this way — there, the billing day only delays the customer's "Overdue" badge, never the red cell (gotcha #83) |
| Otherwise                                                                                                  | `unpaid` (from day 1 of the month — there is no grace period)                                                       |

Notes:

- A payment with `amount_paid = 0` is treated as "no payment" — cell shows unpaid (slot reserved but not paid). This lets staff reserve a row without recording a collection.
- A **partial** payment (`0 < amount_paid < amount_due`, `balance > 0`) renders exactly like a full `paid` cell (green/yellow) — there is **no** separate `partial` status. The remaining `balance` is tracked only as a **debt** (Debts tab → "months" category); it is not shown as a distinct cell state. Tapping opens the receipt sheet, where the remaining amount is shown (amber accent, "added to debts").
- A **skipped** month means "nothing is expected here". It is never unpaid, never overdue, never counted in the dashboard's `unpaidThisMonth`, and **never payable** — the user must unskip first. Money wins: if a skipped month somehow also holds an active payment, the cell reads `paid`.

## 2. Cell rendering — regular customer (default)

| #    | Scenario                           | Steps                               | Expected result                                                                                                                 |
| ---- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | PAID cell                          | Regular customer paid March         | Green background, white "Mar" text, "PAID" sublabel                                                                             |
| 2.2  | PARTIAL cell (looks paid)          | Regular customer with `balance > 0` (paid part of the due) | Green background + "PAID" sublabel — **identical to a full paid cell** (NOT amber, no "PARTIAL" sublabel). Tapping opens the receipt sheet showing the remaining amount ("added to debts"); the remainder appears on the Debts tab |
| 2.3  | UNPAID cell (past)                 | Past month with no payment          | Red background, white "Mar" text, blank sublabel                                                                                |
| 2.4  | UNPAID cell (current month)        | Current month with no payment       | Red-100 background with red-500 border (highlight), red text, "THIS MONTH" sublabel                                             |
| 2.5  | FUTURE cell                        | A month after today                 | Gray-100 background, gray-400 text, blank sublabel                                                                              |
| 2.6  | BEFORE_START cell                  | Month before the LINE`s start_date (customers have none)    | Gray-100 background, gray-300 text (lighter than future), blank sublabel                                                        |
| 2.7  | Multi-month source cell            | First month of a multi-month block  | Green, "PAID" sublabel                                                                                                          |
| 2.8  | Multi-month secondary cell         | Months 2+ in a multi-month block    | Green, "Included" sublabel (`isGroupSecondary = true`). Visually merged with adjacent cells (no gap, square inner corners)      |
| 2.9  | Multi-month spanning year boundary | Block covers Dec → Feb              | In year Y: Dec source. In year Y+1: Jan + Feb secondary, with chevron indicator that the block continues from the previous year |
| 2.10 | Grid layout                        | All 12 months render                | 4-column grid, evenly spaced                                                                                                    |
| 2.11 | Localization of month labels       | Switch language                     | "Jan/Feb/..." replaced with locale equivalents                                                                                  |
| 2.12 | memo on MonthCell                  | Tap a cell                          | Other cells do NOT re-render (verify with React DevTools)                                                                       |

## 3. Cell rendering — non-regular customer

| #    | Scenario                       | Steps                                              | Expected result                                                                                       |
| ---- | ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 3.1  | PAID cell                      | Non-regular paid March                             | Yellow/Gold background, white "Mar" text, "PAID" sublabel                                             |
| 3.2  | PARTIAL (looks paid)           | Non-regular with balance > 0                       | Yellow/Gold background + "PAID" sublabel — identical to a full paid cell (no separate partial state); remainder is a debt |
| 3.3  | UNPAID cell (past)             | Non-regular past month with no payment             | Light gray background (NOT red), gray text, blank sublabel                                            |
| 3.4  | UNPAID cell (current month)    | Non-regular current month, no payment              | Light gray. NO red highlight. NO "THIS MONTH" sublabel — because non-regular is never "overdue"       |
| 3.5  | FUTURE cell                    | Same as regular                                    | Gray-100, gray-400 text                                                                               |
| 3.6  | BEFORE_START                   | Same as regular                                    | Gray-100, gray-300 text                                                                               |
| 3.7  | Unpaid banner                  | Non-regular customer, current month unpaid         | Banner NOT shown                                                                                      |
| 3.8  | Unpaid tab membership          | Non-regular customer with no current-month payment | NOT included in "Unpaid" tab on customer list                                                         |
| 3.9  | Dashboard unpaid count         | Non-regular customer with no current-month payment | NOT counted in `unpaidThisMonth`                                                                      |
| 3.10 | Toggling regular ↔ non-regular | Edit customer, flip `isRegular`                    | Grid colors swap immediately on next render                                                           |

## 4. Status-by-status behavioural cases

### 4.1 BEFORE_START

| #     | Scenario                          | Steps                     | Expected result                                                                                |
| ----- | --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| 4.1.1 | Customer started 2024-06          | View 2024 grid            | Jan–May = before_start, Jun → status logic                                                     |
| 4.1.2 | Same customer in 2023             | Navigate to 2023          | All 12 months = before_start                                                                   |
| 4.1.3 | Tap a before_start cell           | Tap                       | Info popup: "This month is before the plan's start date. No payment can be recorded here." |
| 4.1.4 | Plan line with start_date today    | Today is 2026-05-08       | Jan–Apr 2026 = before_start. May = current/unpaid                                              |
| 4.1.5 | Plan line with future start_date   | Start = next month        | Current month + earlier = before_start; start month onward follows future/unpaid logic         |
| 4.1.6 | start_date day in middle of month | start_date = "2024-03-15" | Mar 2024 is NOT before_start (month-level comparison). Customer can pay for March              |

### 4.2 PAID

| #     | Scenario                         | Steps                                     | Expected result                                                             |
| ----- | -------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| 4.2.1 | New payment                      | Pay May 2026                              | Cell turns green/yellow (regular/non-regular) immediately on form dismiss   |
| 4.2.2 | Voided payment                   | Void Mar 2026 (was paid)                  | Mar 2026 reverts to UNPAID (cell color follows isRegular)                   |
| 4.2.3 | Multi-month block                | Pay Jan–Mar bundle                        | All 3 cells become PAID; Jan has "PAID" sublabel; Feb + Mar have "Included" |
| 4.2.4 | Multiple payments same year      | Pay several months                        | All paid cells render correctly; year card "paid" count matches             |
| 4.2.5 | Tap a single-month paid cell     | Tap                                       | Receipt sheet opens (read-only)                                             |
| 4.2.6 | Tap a multi-month secondary cell | Tap a Feb cell that is `isGroupSecondary` | Opens the source payment's receipt (the Jan record)                         |
| 4.2.7 | Partial paid cell                | Tap a green cell whose payment has balance > 0 | Cell itself is green ("PAID") like any paid month; receipt opens with amber accent + "{amount} added to debts" row |
| 4.2.8 | amount_paid = 0 payment exists   | Inspect the cell                          | Cell is UNPAID (slot exists in DB but treated as unpaid)                    |

### 4.3 FUTURE

| #     | Scenario                        | Steps                                                 | Expected result                                                    |
| ----- | ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| 4.3.1 | Today is 2026-05-08, view 2026  | Look at Jun–Dec                                       | Future (gray)                                                      |
| 4.3.2 | Future cell — active customer   | Tap                                                   | PaymentFormSheet opens (allowed)                                   |
| 4.3.3 | Future cell — inactive customer | Tap                                                   | PaymentFormSheet opens but submit blocked with inline amber banner |
| 4.3.4 | Navigate to future year         | All cells future (unless future-dated payments exist) |
| 4.3.5 | Future-dated payment            | Customer pre-paid for next year                       | That cell renders PAID instead of future                           |

### 4.4 UNPAID

| #     | Scenario                            | Steps                       | Expected result                                  |
| ----- | ----------------------------------- | --------------------------- | ------------------------------------------------ |
| 4.4.1 | Past month, no payment (regular)    | Tap                         | Form opens, arrears recordable                   |
| 4.4.2 | Current month, no payment (regular) | Tap                         | Form opens; current-month highlight in cell      |
| 4.4.3 | Voided payment leaves cell unpaid   | Void a paid month           | Cell flips to red (regular) / gray (non-regular) |
| 4.4.4 | Re-pay after void                   | Tap voided-month cell, save | Cell green/yellow again                          |

### 4.5 SKIPPED

A month marked "not expected to pay" on ONE service line (`skipped_months`, boolean toggle). Any user can skip / unskip; the note is optional.

| #      | Scenario                              | Steps                                                          | Expected result                                                                                                       |
| ------ | ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 4.5.1  | Skip an unpaid month                  | 3-dot → Skip month → confirm (no note)                         | Cell turns slate with "Skipped" sublabel; year card shows a "N skipped" chip; the month leaves the unpaid count        |
| 4.5.2  | Skip with a note                      | Skip and type a reason                                         | Saved on the row; shown when the unskip dialog opens for that month                                                    |
| 4.5.3  | Skip a future month                   | 3-dot → Skip on a future month                                 | Allowed; cell reads skipped (skipped outranks future)                                                                  |
| 4.5.4  | Skip not offered on a paid month      | 3-dot on a paid / partial cell                                 | Skip NOT listed (void the payment first)                                                                               |
| 4.5.5  | Tap a skipped cell                    | Tap the cell body                                              | Unskip confirmation opens — **never** the payment form                                                                 |
| 4.5.6  | Unskip                                | Confirm the unskip                                             | Cell reverts to unpaid / future by the normal rules; the row stays in the DB with `skipped = false`                    |
| 4.5.7  | Re-skip the same month                | Skip → unskip → skip again                                     | Works; the same row is reused (no duplicate row, no unique-violation error)                                            |
| 4.5.8  | Quick pay excludes it                 | Customer list → Quick pay, customer's only line skipped this month | The line is not paid; the customer shows no "quick pay" prompt for it                                                |
| 4.5.9  | Deep-link quick pay                   | Customer list quick-pay on a customer whose current month is skipped | Popup "This month is skipped… unskip it first"; the form does NOT open                                            |
| 4.5.10 | Multi-month block over a skipped month | 3-month plan, month 2 of the window is skipped → Pay           | Payment refused with "The following months are skipped: … Unskip them first"; nothing is written                       |
| 4.5.11 | Not overdue                           | Skip a past unpaid month, return to the customer list          | The customer loses the red "Unpaid" flag if that was the only unpaid month                                             |
| 4.5.12 | Dashboard unpaid count                | Skip the current month for a regular customer                  | `unpaidThisMonth` drops by one                                                                                         |
| 4.5.13 | "N/M plans paid" badge                | 2 plans, no backlog: one paid this month, one skipped this month | Customer reads fully **paid** — the skipped month isn't required, so that line owes nothing and the badge doesn't show "1/2" |
| 4.5.13a | Card badge — all lines skipped       | Single-plan customer with no earlier unpaid month, skip the current month, return to the list | Card shows a slate **"Skipped"** pill, NOT the red "Unpaid"; same after a pull-to-refresh (both status paths agree). With an earlier month still unpaid it reads **"Overdue"** instead |
| 4.5.13b | Card badge — partly skipped          | 2 plans: one skipped, one unpaid this month                    | Card still reads **Unpaid** (a real line is owed)                                                                       |
| 4.5.13c | Card badge — skipped but overdue     | Skip the current month on a customer with an older unpaid month | Card stays red **Unpaid** — an unpaid past month outranks the skip                                                     |
| 4.5.13d | Unpaid tab                            | Skip the current month for a customer with no older debt, open the **Unpaid** tab | The customer is not listed                                                                    |
| 4.5.14 | Cancelled plan / inactive customer    | Unskip a future month on a cancelled plan                      | Unskip still allowed (it isn't a payment); paying that future month stays blocked by the existing rule                  |
| 4.5.15 | Skip is per line                      | 2 plans, skip the current month on plan A only                 | Plan B's grid is unaffected and still owes the month                                                                   |
| 4.5.16 | Offline skip + sync                   | Skip offline, then reconnect                                   | Row pushes on the natural key; a second device skipping the same month converges to one row (no duplicate)             |
| 4.5.17 | Offline unskip + sync                 | Skip on device A (synced), unskip on device B, sync both       | Device A's cell returns to unpaid after pull — the `skipped = false` row carries the change                            |

## 5. Year navigation

| #   | Scenario                          | Steps                        | Expected result                                                           |
| --- | --------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| 5.1 | Default year                      | Open detail                  | Current year                                                              |
| 5.2 | Backward limit                    | Tap "<" repeatedly           | Stops at customer's startDate.year. Button disabled at limit              |
| 5.3 | Forward unlimited                 | Tap "›" repeatedly           | No upper limit                                                            |
| 5.4 | Year fetch                        | Switch year                  | New API call for that year's payments; spinner replaces grid until loaded |
| 5.5 | Year totals update                | Switch                       | Updated paid/unpaid/collected for that year                               |
| 5.6 | Concurrent switch                 | Tap "<" twice fast           | Latest fetch wins (no flickering or stale data)                           |
| 5.7 | Multi-month visible in both years | Block crossing year boundary | Source in year Y; secondary cells in year Y+1                             |

## 5b. Plan name + price header (above the grid)

The header shows the selected service line's plan name and its price. It renders for **every** customer now, not only multi-plan ones.

| #    | Scenario                    | Steps                                              | Expected result                                                                       |
| ---- | --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 5b.1 | Single-plan customer        | Open a customer holding one fixed-price plan       | Header shows "<plan name> · <price> / month" above the year row                        |
| 5b.2 | Multi-plan customer         | Open a customer with 2+ lines, switch line tabs    | Header name + price follow the selected line                                          |
| 5b.3 | Custom-price plan           | Line whose plan has isCustomPrice                  | Price reads "Custom" — no amount (there is no fixed price to show)                     |
| 5b.4 | Plan-less line              | Line with planId = null                            | Name reads "No plan"; price reads "Custom"                                            |
| 5b.5 | Multi-month plan            | Plan with durationMonths = 3                       | Price reads "<price> / 3mo" — the bundle price, not a per-month amount                |
| 5b.6 | Display-currency conversion | Switch display currency                            | Price re-renders converted into the display currency (plan currency is the source)     |
| 5b.7 | Cancelled line             | Select a cancelled line                            | Name still carries the "· Cancelled" tag, price shown as normal                        |
| 5b.8 | Long plan name             | Plan with a very long name                         | Name truncates to one line; the price stays visible (never pushed off-screen)          |
| 5b.9 | Arabic / RTL               | Switch to Arabic                                   | Header mirrors correctly; price sits after the name; "/ شهرياً" reads right            |

## 6. Current month turns unpaid on day 1 (no grace period)

There is no grace setting anywhere — no tier, no tenant option. The current month is UNPAID as soon as it starts and has no payment.

| #   | Scenario                     | Steps                                        | Expected result                                                                                                        |
| --- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 6.1 | Day 1, no payment            | Set the device date to the 1st               | Cell UNPAID with the current-month highlight                                                                            |
| 6.2 | Mid-month, no payment        | Day 10, still unpaid                         | Cell UNPAID (unchanged — nothing flips part-way through the month)                                                       |
| 6.3 | Card matches grid            | Day 1, no payment                            | Customer-list pill red "Unpaid" and the grid cell red — never one red and the other grey (see [customers.md § 1.15b](customers.md)) |
| 6.4 | Any tier behaves the same    | Repeat 6.1 on Free, Pro and Business tenants | Identical result — the tier no longer affects month status                                                               |

## 7. Date / timezone correctness

| #   | Scenario                     | Steps                                        | Expected result                                                              |
| --- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| 7.1 | Local midnight transitions   | Device clock at 23:59 then 00:01 of next day | Current month / day-of-month update without crash                            |
| 7.2 | DST transitions              | Force DST shift                              | Status logic uses pure year/month integer comparisons → unaffected           |
| 7.3 | start_date with leading zero | start_date = "2024-03-05"                    | `isBeforeStartDate` compares year/month only — March 2024 is allowed         |
| 7.4 | Year boundary                | Today = Jan 1                                | Dec of last year follows status logic for "past" months (UNPAID if not paid) |

## 8. Performance

| #   | Scenario            | Steps                                   | Expected result                                                         |
| --- | ------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 8.1 | useMemo on grid     | Re-render parent                        | Grid recomputed only when payments / customer / year change             |
| 8.2 | React.memo on cells | Tap a cell                              | Other 11 cells do not re-render                                         |
| 8.3 | Smooth tap          | Tap rapidly across cells                | Transitions smooth (memoization keeps rendering cheap)                  |
| 8.4 | Large payment count | Customer with many payments in the year | Grid still computes in <16ms                                            |

## 9. Visual / accessibility

| #   | Scenario        | Steps                                 | Expected result                                                                                                                          |
| --- | --------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1 | Color contrast  | Inspect with accessibility tool       | PAID green and UNPAID red against white text meet WCAG AA                                                                                |
| 9.2 | Color blindness | Simulate red/green color blindness    | Cell ALSO encodes status via "PAID" / "Included" / "THIS MONTH" sublabel — verify sufficient                                             |
| 9.3 | Tap target size | Each cell                             | ≥ 44pt tall                                                                                                                              |
| 9.4 | Screen reader   | Enable VoiceOver / TalkBack on a cell | Reads month label and status (verify accessibilityLabel; if missing, file a finding)                                                     |
| 9.5 | RTL grid        | Arabic                                | Months ordered Jan → Dec (data order); visually right-to-left if container is RTL. Multi-month chevrons point in the right RTL direction |

## 10. Edge cases

| #     | Scenario                                   | Steps                                            | Expected result                                                                                                       |
| ----- | ------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 10.1  | Year with no payments                      | Navigate to a year before customer was active    | All before_start                                                                                                      |
| 10.2  | Year with all 12 paid (single-month plan)  | Pay all 12 months                                | All green/yellow; year card 12 paid / 0 unpaid                                                                        |
| 10.3  | Year fully covered by multi-month payments | Pay Jan–Dec via four 3-month bundles             | All 12 PAID with `isGroupSecondary` on months 2/3 of each bundle                                                      |
| 10.4  | Year mixing all statuses                   | Customer started May 2024, today is May 2026     | 2024: Jan–Apr before_start, May–Dec mix; 2025: full mix; 2026: Jan–Apr based on payments, May current, Jun–Dec future |
| 10.5  | Customer plan removed mid-year             | Customer changed from Plan A to no plan in July  | Earlier paid months retain plan_id A snapshot; later payments require manual amount                                   |
| 10.6  | Plan deleted                               | Plan A deleted                                   | Earlier months still PAID (snapshot amount intact). plan_id becomes null on those rows                                |
| 10.7  | Leap year February                         | View Feb 2024                                    | Renders normally                                                                                                      |
| 10.8  | Customer reactivated mid-year              | Deactivate in March, reactivate in June          | Payment recording allowed for current/past at all times; future months blocked while inactive only                    |
| 10.9  | Partial payment then voided                | Pay 50/100 in May, then void                     | May reverts to UNPAID                                                                                                 |
| 10.10 | Multi-month with mid-block void            | Pay Jan–Mar bundle, then void                    | All 3 months revert in a single op                                                                                    |
| 10.11 | Voided payment in legacy data              | Customer with voided payment for current month   | Cell renders UNPAID (voided row filtered out)                                                                         |
| 10.12 | amount_paid = 0 "reserved" row             | Save with `amount_paid = 0` (if allowed via API) | Cell shows UNPAID; row exists but is invisible to coverage logic                                                      |
| 10.13 | RTL multi-month chevrons                   | Arabic                                           | Chevrons reverse direction via `DirectionalIcon`                                                                      |

## 11. Cell action menu (3-dot)

Each actionable cell shows a small 3-dot button in its top-end corner. Tapping it opens an `ActionMenu` titled with the month + year. The cell body tap still works as before. The menu is shown on every cell except `before_start` (which stays tap-only).

| #     | Scenario                          | Steps                                          | Expected result                                                                                          |
| ----- | --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 11.1  | Button visibility                 | Inspect cells of each status                   | 3-dot shown on unpaid/paid/future (a partial payment is a paid cell); NOT on before_start. Icon color contrasts with the cell |
| 11.2  | Open action — unpaid              | 3-dot → Open on an unpaid month                | PaymentFormSheet opens (same as tapping the cell)                                                        |
| 11.3  | Open action — paid                | 3-dot → Open on a paid month (incl. a partial payment) | PaymentDetailSheet (receipt) opens                                                              |
| 11.4  | Quick Pay — fixed single-month    | 3-dot → Pay on unpaid month, 1-month plan      | Full plan price recorded immediately for that month; cell spinner then turns paid. No form shown          |
| 11.5  | Quick Pay — multi-month plan      | 3-dot → Pay on unpaid month, plan duration > 1 | Confirm dialog with bundle amount + month range; on confirm records the block starting at that month      |
| 11.5b | Quick Pay — future month (prepay) | 3-dot → Pay on a future month, fixed plan      | Records a prepayment for that future month; cell turns paid. Multi-month confirms first as in 11.5         |
| 11.6  | Quick Pay — custom-price/no plan  | 3-dot → Pay where plan is custom or absent     | Quick Pay NOT offered; Open falls back to the form for manual amount entry                                |
| 11.7  | Quick Pay hidden on paid           | 3-dot on a paid month (incl. a partial payment) | Quick Pay action NOT listed (a payment already exists)                                                  |
| 11.8  | Quick Pay hidden — inactive       | Inactive customer, unpaid month                | Quick Pay NOT offered                                                                                     |
| 11.9  | Void action — active payment      | 3-dot → Void on a paid month (incl. a partial payment) | VoidSheet opens; confirming voids the payment and reverts the cell                               |
| 11.10 | Void on multi-month secondary     | 3-dot → Void on an "Included" cell             | VoidSheet voids the whole block (uses block warning copy)                                                |
| 11.11 | Void hidden on unpaid             | 3-dot on an unpaid month                       | Void action NOT listed (no payment to void)                                                              |
| 11.12 | Dots tap vs cell tap             | Tap the 3-dot only                             | Opens the menu; does NOT trigger the cell-body open action                                               |
| 11.13 | Quick Pay error                   | Force a create failure (e.g. month conflict)   | Error surfaces in the panel ErrorBanner; spinner clears                                                  |
| 11.14 | RTL placement                     | Arabic                                         | 3-dot sits in the top-leading corner (end-anchored), menu labels localized                               |
| 11.15 | Skip / Unskip rows                | 3-dot on an unpaid, a future, and a skipped cell | "Skip month" listed on unpaid + future; "Unskip month" on skipped; never both at once                  |

## 12. Multi-select bulk actions

Long-press a non-`before_start` cell to enter selection mode: selected cells gain a primary ring + check badge, the 3-dot hides, and a toolbar (`X · "N selected" · [Pay] [Void]`) appears directly above the grid. Tap toggles; toolbar X / Android back / emptying the selection / changing year / leaving the screen all exit. Pay/Void each act only on their eligible subset of the selection.

| #     | Scenario                                  | Steps                                                            | Expected result                                                                                                   |
| ----- | ----------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 12.1  | Enter selection                           | Long-press an unpaid month                                      | Cell shows ring + check; toolbar appears above grid; 3-dot hidden on all cells                                    |
| 12.2  | Toggle on/off                             | In selection mode tap a selected then an unselected cell        | Tapping toggles each cell's check; emptying the last selection exits selection mode                               |
| 12.3  | before_start inert                        | Long-press / tap a before_start cell                            | No selection, no badge, no toggle                                                                                  |
| 12.4  | Exit paths                                | Use toolbar X, Android back, change year, leave screen          | Each clears the selection and hides the toolbar                                                                   |
| 12.5  | Fixed single-month bulk pay               | Select several unpaid months (1-month fixed plan) → Pay         | Confirm with count → all become PAID at full plan price in **one** operation; year summary updates                |
| 12.6  | Custom / no-plan bulk pay                 | Select several months (custom plan) → Pay                       | BulkPaymentFormSheet opens; one amount (full/partial + currency) entered → applied to every selected month        |
| 12.7  | Multi-month bulk pay (blocks)             | Multi-month plan: tap an unpaid month                           | Its whole start-aligned N-month window auto-selects; selecting a 2nd window adds another block                    |
| 12.8  | Multi-month bulk pay creates per block    | Select 2 windows → Pay                                          | Confirm with block count → one payment per block (full price); already-paid months inside a window are skipped     |
| 12.9  | Bulk void                                 | Select several paid months (incl. partial payments) → Void      | ConfirmDialog (+ optional reason) → each unique payment voided once; cells revert                                 |
| 12.10 | Void whole block from any covered cell    | Select one "Included" cell of a multi-month block → Void        | The whole block's single payment is voided (deduped by payment id)                                                |
| 12.11 | Mixed selection                           | Select some unpaid + some paid months                           | Toolbar shows **both** Pay and Void; Pay affects only the unpaid, Void only the paid; ineligible skipped          |
| 12.12 | Partial months are void-only              | Select a partially-paid month (a green cell with balance > 0)   | Treated like any paid cell: counts toward Void, not Pay (topping up is via the per-cell edit, not bulk pay)        |
| 12.13 | Inactive customer + future                | Inactive customer, select a future month                        | Future stays non-payable (excluded from the Pay subset), matching the per-cell rule                               |
| 12.14 | Partial failure summary                   | Force one create/void to fail in a bulk run                     | Remaining succeed; an amber notice banner shows "ok · failed" counts; selection clears                            |
| 12.15 | Single round-trip                         | Bulk-pay N months / void N payments                             | One batched DB write per action (not N) — verify via network/db; grid rebuilds once                               |
| 12.16 | RTL                                       | Arabic                                                          | Toolbar, badges, and ring render correctly end-anchored; labels localized                                        |
| 12.17 | Bulk skip                                 | Select several unpaid/future months → Skip                      | One confirm (with optional note applied to all) → every selected month turns slate in one write; selection clears |
| 12.18 | Bulk unskip                               | Select several skipped months → Unskip                          | All revert in one write                                                                                          |
| 12.19 | Mixed skip selection                      | Select some unpaid + some skipped months                        | Toolbar shows **both** Skip and Unskip; each acts only on its own subset                                         |
| 12.20 | Skipped cell selection unit               | Multi-month plan: tap a skipped cell in a block window          | Only that one cell is selected (a skipped month is never part of a payable block)                                |

---

## 13. Pay oldest month first

A month cannot be paid while an **earlier** month of the same service line is still unpaid. See [features.md](../docs/features.md) → Pay Oldest Month First and gotcha #77. Setup for most rows: one line starting Jan 2026, nothing paid, "today" = May 2026 (so Jan–May are unpaid).

| #     | Scenario                                       | Steps                                                                       | Expected result                                                                                                          |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 13.1  | Tap a later unpaid month                       | Tap March                                                                   | Info popup "January 2026 is still unpaid on this plan. Older months must be paid first." Form does NOT open              |
| 13.2  | Tap the oldest unpaid month                    | Tap January                                                                 | Payment form opens normally                                                                                              |
| 13.3  | Pay in order                                   | Pay January, then tap February                                              | February now opens; March still blocked until February is paid                                                           |
| 13.4  | Quick-pay menu hidden                          | Open the 3-dot menu on March                                                | "Pay now" and "Pay & send on WhatsApp" are absent; Open and Skip remain                                                   |
| 13.5  | Quick-pay menu shown on the oldest             | Open the 3-dot menu on January                                              | "Pay now" present and works                                                                                              |
| 13.6  | Prepay a future month with a backlog           | Tap July (future)                                                           | Blocked with the same popup                                                                                              |
| 13.7  | Prepay with NOTHING owed                       | Line fully paid through May → tap July                                      | Allowed — the form opens (prepay is still possible)                                                                       |
| 13.8  | Backlog paid together (multi-select)           | Long-press January, add February + March → Pay                              | Allowed; all three recorded in one batch                                                                                  |
| 13.9  | Cherry-picked selection refused                | Select February + March only (January still unpaid) → Pay                   | Popup names January; nothing is written                                                                                   |
| 13.10 | Backlog in a PREVIOUS year                     | Line starts 2025, Dec 2025 unpaid → open 2026 and tap any month             | Blocked and the popup names **December 2025**, even though it is not on the visible grid                                  |
| 13.11 | Skipped months never block                     | Skip January, then tap February                                             | Allowed — a skipped month is not owed                                                                                     |
| 13.12 | Partially-paid months never block              | Pay January partially (balance > 0), then tap February                      | Allowed — a partial payment reads as paid; the remainder is a debt                                                        |
| 13.13 | Multi-month block starting at the first unpaid | 3-month plan, nothing paid → tap the block's first month                    | Allowed; the whole window is recorded                                                                                     |
| 13.14 | Later multi-month window refused               | 3-month plan, first window unpaid → tap a month in the SECOND window        | Blocked, naming the first window's first month                                                                            |
| 13.15 | Unpaid banner "Collect"                        | Backlog exists, tap Collect in the red current-month banner                 | Same popup — the banner button goes through the same gate                                                                 |
| 13.16 | Customer-list quick pay hidden                 | Customer list, a customer with an older unpaid month                        | Quick pay row absent from the card menu; the red "Overdue" pill still shows                                               |
| 13.17 | Bulk quick pay skips overdue lines             | Select several customers, some overdue → Quick pay                          | Overdue lines are excluded from the batch; the confirm counts only collectable lines (all-overdue selection → "none" info) |
| 13.18 | Multi-plan: only the overdue line is blocked   | Customer with plan A (up to date) + plan B (backlog) → list quick pay        | Plan A's current month is collected; plan B is left for the detail grid                                                   |
| 13.19 | Form banner backstop                           | Reach `PaymentFormSheet` for a blocked month (deep link / stale sheet)      | Amber banner with the same message; both submit buttons disabled                                                          |
| 13.20 | Service-level refusal                          | Force a blocked write past the UI                                           | Store `error` banner: "<Month> is still unpaid on this plan…"; nothing written                                            |
| 13.21 | Void reopens the order                         | Pay Jan + Feb, then void January                                            | January is unpaid again → March becomes blocked until January is re-paid                                                  |
| 13.22 | Voiding / skipping / editing unaffected        | On a blocked month use Skip; on a paid month use Void and Edit amount        | All work — the rule only gates recording NEW money                                                                        |
| 13.23 | RTL + Arabic message                           | Arabic                                                                      | Popup text localized, month name and year read correctly                                                                  |
