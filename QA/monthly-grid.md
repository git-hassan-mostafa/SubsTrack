# Monthly Grid — QA Scenarios

The 12-cell grid is the core of the customer detail screen. Each cell encodes a month's status: PAID (green), UNPAID (red), FUTURE (gray), or BEFORE_START (gray, slightly dimmer). The status logic lives in exactly one place: `PaymentService.buildMonthGrid`. Verify nothing else re-implements it.

**Reference code:**
- Service (logic): [PaymentService.ts buildMonthGrid](SubsTrack/src/modules/payments/services/PaymentService.ts)
- Grid: [MonthGrid.tsx](SubsTrack/src/modules/payments/components/MonthGrid.tsx)
- Cell: [MonthCell.tsx](SubsTrack/src/modules/payments/components/MonthCell.tsx)
- Year navigator: [YearNavigator.tsx](SubsTrack/src/modules/payments/components/YearNavigator.tsx)
- Date utils: [date.ts](SubsTrack/src/core/utils/date.ts)

---

## 1. Status truth table

For year Y, month M, given today = (CY, CM), customer.startDate = SY-SM-SD, graceDays = G:

| Condition | Status |
|-----------|--------|
| Y < SY OR (Y == SY AND M < SM) | `before_start` |
| Payment exists for Y-M-01 AND voided_at IS NULL | `paid` |
| Y > CY OR (Y == CY AND M > CM) | `future` |
| First-of-month ≤ today ≤ first-of-month + G days | `future` (within grace) |
| Otherwise | `unpaid` |

## 2. Cell rendering

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | PAID cell | Customer paid March 2026 | Green background, white "Mar" text, "PAID" sublabel |
| 2.2 | UNPAID cell (past) | Past month with no payment | Red background, white "Mar" text, sublabel blank (only PAID and current-month show sublabels) |
| 2.3 | UNPAID cell (current month) | Current month with no payment | Red-100 background with red-500 border (highlight), red text "May", sublabel "THIS MONTH" |
| 2.4 | FUTURE cell | A month after today | Gray-100 background, gray-400 text, blank sublabel |
| 2.5 | BEFORE_START cell | Month before customer.start_date | Gray-100 background, gray-300 text (slightly lighter than future), blank sublabel |
| 2.6 | Grid layout | All 12 months render | 4-column grid, evenly spaced (w-1/4 per cell) |
| 2.7 | RTL grid | Arabic | Months still ordered Jan → Dec (data order), but visually right-to-left if container is RTL |
| 2.8 | Cell tap area | Tap edge of a cell | Triggers `onCellPress` (entire cell is pressable) |
| 2.9 | Localization of month labels | Switch language | "Jan/Feb/..." replaced with locale equivalents |
| 2.10 | memo on MonthCell | Re-render scenario | MonthCell does not re-render unless `entry` prop changes (verify with React DevTools) |

## 3. Status-by-status behavioural cases

### 3.1 BEFORE_START (gray, dim)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1.1 | Customer started 2024-06 | View 2024 grid | Jan–May = before_start (gray), Jun → status logic |
| 3.1.2 | Same customer in 2023 | Navigate to 2023 | All 12 months = before_start |
| 3.1.3 | Tap a before_start cell | Tap | Info popup: "This month is before the customer's start date. No payment can be recorded here." |
| 3.1.4 | Customer with start_date today | Today is 2026-05-08 | Months Jan–Apr 2026 = before_start. May = current/unpaid. |
| 3.1.5 | Customer with future start_date | Start date = next month | Current month + earlier = before_start; the start month onward follows future/unpaid logic |

### 3.2 PAID (green)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.2.1 | New payment | Pay May 2026 | Cell turns green immediately on form dismiss |
| 3.2.2 | Voided payment | Void Mar 2026 (was paid) | Mar 2026 cell reverts to UNPAID |
| 3.2.3 | Multiple payments same year | Pay several months | All paid cells render green; year card "paid" count matches |
| 3.2.4 | Tap a paid cell | Tap | Receipt sheet opens (read-only) |

### 3.3 FUTURE (gray)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.3.1 | Today is 2026-05-08, view 2026 | Look at Jun–Dec | Each rendered as future (gray) |
| 3.3.2 | Future cell — active customer | Tap a future cell | Form opens (allowed) |
| 3.3.3 | Future cell — inactive customer | Tap a future cell on inactive customer | Info popup: "This customer is inactive. Future month payments cannot be recorded for inactive customers." |
| 3.3.4 | Navigate to future year | Year navigator forward | All cells = future (assuming no future-dated payments) |
| 3.3.5 | Future-dated payment exists | Customer pre-paid for next year | That cell renders PAID (green) instead of future |

### 3.4 UNPAID (red)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.4.1 | Past month, no payment | Tap | Form opens, can record arrears |
| 3.4.2 | Current month, no payment | Tap | Same, with banner shown above grid |
| 3.4.3 | Voided payment leaves cell unpaid | Void a paid month, look at cell | Cell now red |
| 3.4.4 | Re-pay after void | Tap voided-month cell, save | Cell green again |

## 4. Year navigation

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Default year | Open detail | Current year selected |
| 4.2 | Backward limit | Tap "‹" repeatedly | Stops at customer's startDate.year. Button disabled at limit |
| 4.3 | Forward unlimited | Tap "›" repeatedly | No upper limit (in current implementation) |
| 4.4 | Year fetch | Switch year | New API call for that year's payments; spinner replaces grid until loaded |
| 4.5 | Year totals update | Switch to a different year | "<paid>/<unpaid>/<collected>" updated for that year |
| 4.6 | Concurrent switch | Tap "‹" twice fast | Latest fetch wins (verify no flickering or stale data) |

## 5. Grace period interaction

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | graceDays = 0 (current default) | Day 1 of month, no payment | Cell renders UNPAID immediately |
| 5.2 | graceDays = 5, day 3 | Within grace | Cell renders FUTURE (highlight is current month only when status = unpaid) |
| 5.3 | graceDays = 5, day 6 | Past grace cutoff | Cell renders UNPAID |
| 5.4 | Grace edge — day 5 (== cutoff) | Today equals firstOfMonth + 5 | Cell renders FUTURE (`<= cutoff`) |

## 6. Date / timezone correctness

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Local midnight transitions | Force device clock to 23:59 then 00:01 of next day | Current month / day-of-month update without crash; status logic uses local time |
| 6.2 | DST transitions | Force a DST shift | Status logic uses pure year/month integer comparisons → unaffected |
| 6.3 | Customer start_date with leading zero | start_date = "2024-03-05" | `isBeforeStartDate` compares year/month only — March 2024 is allowed |
| 6.4 | Customer start_date day in middle of month | start_date = "2024-03-15" | Mar 2024 is NOT before_start (month-level comparison). Customer can pay for March even though started day 15 — verify intent |
| 6.5 | Year boundary | Today = Jan 1 | Dec of last year follows status logic for "past" months (UNPAID if not paid) |

## 7. Performance

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | useMemo on grid | Re-render parent | Grid recomputed only when payments / customer / year / graceDays change |
| 7.2 | React.memo on cells | Tap a cell | Other 11 cells do not re-render |
| 7.3 | Smooth tap | Tap rapidly across cells | Transitions are smooth (memoization keeps rendering cheap) |
| 7.4 | Large payment count | Customer with 12 payments in the year | Grid still computes in <16ms |

## 8. Visual / accessibility

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Color contrast | Inspect with accessibility tool | PAID green and UNPAID red against white text meet WCAG AA contrast |
| 8.2 | Color blindness | Simulate red/green color blindness | The cell ALSO encodes status via the "PAID" / "THIS MONTH" sublabel — verify it is sufficient |
| 8.3 | Tap target size | Each cell | ≥ 44pt tall (py-3 + text rows ≈ 56pt) |
| 8.4 | Screen reader | Enable VoiceOver / TalkBack on a cell | Reads month label and status (verify accessibilityLabel; if missing, file a finding) |

## 9. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Year with no payments | Navigate to a year before customer was active | All before_start (gray) |
| 9.2 | Year with all 12 paid | Pay all 12 months | All green; year card 12 paid / 0 unpaid |
| 9.3 | Year mixing all statuses | A customer started May 2024, today is May 2026 | 2024 grid: Jan–Apr before_start, May–Dec mix; 2025: full mix; 2026: Jan–Apr based on payments, May current, Jun–Dec future |
| 9.4 | Customer plan removed mid-year | Customer changed from Plan A to no plan in July | Earlier paid months retain plan_id A snapshot; later payments require manual amount |
| 9.5 | Plan deleted | Plan A is deleted | Earlier months still show as paid (snapshot amount intact). plan_id becomes null on those rows |
| 9.6 | Leap year February | View Feb 2024 | Renders normally; leap-day logic doesn't matter for monthly billing |
| 9.7 | Customer reactivated mid-year | Deactivate in March, reactivate in June | Payment recording allowed for current/past at all times; future months blocked while inactive only |
