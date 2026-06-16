# Monthly Grid — QA Scenarios

The 12-cell grid is the core of the customer detail screen. Each cell encodes a month's status: PAID (green for regular / yellow for non-regular), PARTIAL (amber for both regular and non-regular), UNPAID (red for regular / light gray for non-regular), FUTURE (gray), or BEFORE_START (gray, slightly dimmer). **Multi-month payments** visually merge consecutive cells with a "Included" sublabel for months 2+. **Partial payments** (`amount_paid < amount_due`) render as a distinct `"partial"` status — amber cells, NOT an orange dot on a green cell.

The status logic lives in exactly one place: `PaymentService.buildMonthGrid`. Verify nothing else re-implements it.

**Reference code:**

- Service (logic): [PaymentService.buildMonthGrid](SubsTrack/src/modules/customer-payments/services/PaymentService.ts)
- Grid: [MonthGrid.tsx](SubsTrack/src/modules/customer-payments/components/MonthGrid.tsx)
- Cell: [MonthCell.tsx](SubsTrack/src/modules/customer-payments/components/MonthCell.tsx)
- Year navigator: [YearNavigator.tsx](SubsTrack/src/modules/customer-payments/components/YearNavigator.tsx)
- Customer panel (host): [CustomerPaymentPanel.tsx](SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx)
- Date utils: [date.ts](SubsTrack/src/core/utils/date.ts)

---

## 1. Status truth table

For year Y, month M, given today = (CY, CM), customer.startDate = SY-SM-SD, graceDays = G:

| Condition                                                                                                  | Status                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Y < SY OR (Y == SY AND M < SM)                                                                             | `before_start`                                                                                                     |
| A covering payment exists for Y-M AND `voided_at IS NULL` AND `amount_paid > 0` AND `balance = 0`          | `paid` (green for regular, yellow for non-regular; `isGroupSecondary = true` for months 2+ in a multi-month block) |
| A covering payment exists for Y-M AND `voided_at IS NULL` AND `0 < amount_paid < amount_due` (balance > 0) | `partial` (amber for both regular and non-regular)                                                                 |
| Y > CY OR (Y == CY AND M > CM)                                                                             | `future`                                                                                                           |
| First-of-month ≤ today ≤ first-of-month + G days                                                           | `future` (within grace)                                                                                            |
| Otherwise                                                                                                  | `unpaid`                                                                                                           |

Notes:

- A payment with `amount_paid = 0` is treated as "no payment" — cell shows unpaid (slot reserved but not paid). This lets staff reserve a row without recording a collection.
- A payment with `0 < amount_paid < amount_due` (partial) renders as `partial` — amber cell for both regular and non-regular customers. Tapping opens the receipt sheet (amber theme), just like a `paid` cell.

## 2. Cell rendering — regular customer (default)

| #    | Scenario                           | Steps                               | Expected result                                                                                                                 |
| ---- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | PAID cell                          | Regular customer paid March         | Green background, white "Mar" text, "PAID" sublabel                                                                             |
| 2.2  | PARTIAL cell                       | Regular customer with `balance > 0` | Amber background (NOT green), white text, "PARTIAL" sublabel. Tapping opens receipt in amber theme with "Balance remaining" row |
| 2.3  | UNPAID cell (past)                 | Past month with no payment          | Red background, white "Mar" text, blank sublabel                                                                                |
| 2.4  | UNPAID cell (current month)        | Current month with no payment       | Red-100 background with red-500 border (highlight), red text, "THIS MONTH" sublabel                                             |
| 2.5  | FUTURE cell                        | A month after today                 | Gray-100 background, gray-400 text, blank sublabel                                                                              |
| 2.6  | BEFORE_START cell                  | Month before customer.start_date    | Gray-100 background, gray-300 text (lighter than future), blank sublabel                                                        |
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
| 3.2  | PARTIAL                        | Non-regular with balance > 0                       | Amber background (same amber as regular — PARTIAL is amber for all customers regardless of isRegular) |
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
| 4.1.3 | Tap a before_start cell           | Tap                       | Info popup: "This month is before the customer's start date. No payment can be recorded here." |
| 4.1.4 | Customer with start_date today    | Today is 2026-05-08       | Jan–Apr 2026 = before_start. May = current/unpaid                                              |
| 4.1.5 | Customer with future start_date   | Start = next month        | Current month + earlier = before_start; start month onward follows future/unpaid logic         |
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
| 4.2.7 | Partial paid cell                | Tap a cell with balance > 0               | Receipt opens with amber theme + "Balance remaining" row                    |
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

## 6. Grace period interaction

| #   | Scenario                       | Steps                         | Expected result                                                |
| --- | ------------------------------ | ----------------------------- | -------------------------------------------------------------- |
| 6.1 | graceDays = 0 (default)        | Day 1 of month, no payment    | Cell UNPAID immediately                                        |
| 6.2 | graceDays = 5, day 3           | Within grace                  | Cell FUTURE (no current-month highlight since status = future) |
| 6.3 | graceDays = 5, day 6           | Past cutoff                   | Cell UNPAID with current-month highlight                       |
| 6.4 | Grace edge — day 5 (== cutoff) | Today equals firstOfMonth + 5 | Cell FUTURE (`<=` cutoff)                                      |

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
| 8.1 | useMemo on grid     | Re-render parent                        | Grid recomputed only when payments / customer / year / graceDays change |
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

Each actionable cell shows a small 3-dot button in its top-end corner. Tapping it opens an `ActionMenu` titled with the month + year. The cell body tap still works as before. The menu is shown only on `unpaid`, `paid`, and `partial` cells — `future` and `before_start` cells stay tap-only.

| #     | Scenario                          | Steps                                          | Expected result                                                                                          |
| ----- | --------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 11.1  | Button visibility                 | Inspect cells of each status                   | 3-dot shown on unpaid/paid/partial; NOT on future/before_start. Icon color contrasts with the cell       |
| 11.2  | Open action — unpaid              | 3-dot → Open on an unpaid month                | PaymentFormSheet opens (same as tapping the cell)                                                        |
| 11.3  | Open action — paid/partial        | 3-dot → Open on a paid/partial month           | PaymentDetailSheet (receipt) opens                                                                       |
| 11.4  | Quick Pay — fixed single-month    | 3-dot → Pay on unpaid month, 1-month plan      | Full plan price recorded immediately for that month; cell spinner then turns paid. No form shown          |
| 11.5  | Quick Pay — multi-month plan      | 3-dot → Pay on unpaid month, plan duration > 1 | Confirm dialog with bundle amount + month range; on confirm records the block starting at that month      |
| 11.6  | Quick Pay — custom-price/no plan  | 3-dot → Pay where plan is custom or absent     | Quick Pay NOT offered; Open falls back to the form for manual amount entry                                |
| 11.7  | Quick Pay hidden on paid/partial  | 3-dot on a paid or partial month               | Quick Pay action NOT listed (a payment already exists)                                                   |
| 11.8  | Quick Pay hidden — inactive       | Inactive customer, unpaid month                | Quick Pay NOT offered                                                                                     |
| 11.9  | Void action — active payment      | 3-dot → Void on paid/partial month             | VoidSheet opens; confirming voids the payment and reverts the cell                                       |
| 11.10 | Void on multi-month secondary     | 3-dot → Void on an "Included" cell             | VoidSheet voids the whole block (uses block warning copy)                                                |
| 11.11 | Void hidden on unpaid             | 3-dot on an unpaid month                       | Void action NOT listed (no payment to void)                                                              |
| 11.12 | Dots tap vs cell tap             | Tap the 3-dot only                             | Opens the menu; does NOT trigger the cell-body open action                                               |
| 11.13 | Quick Pay error                   | Force a create failure (e.g. month conflict)   | Error surfaces in the panel ErrorBanner; spinner clears                                                  |
| 11.14 | RTL placement                     | Arabic                                         | 3-dot sits in the top-leading corner (end-anchored), menu labels localized                               |
