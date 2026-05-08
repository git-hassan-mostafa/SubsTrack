# Payments — QA Scenarios

Covers everything that happens when a user taps a month cell: recording a payment (Scenarios A / B / C), opening a paid month receipt, editing the amount of a custom-priced payment, and voiding. Voids are soft (audit-preserved). The month-grid status logic is documented separately in [monthly-grid.md](monthly-grid.md).

**Reference code:**
- Form sheet: [PaymentFormSheet.tsx](SubsTrack/src/modules/payments/components/PaymentFormSheet.tsx)
- Detail sheet (receipt): [PaymentDetailSheet.tsx](SubsTrack/src/modules/payments/components/PaymentDetailSheet.tsx)
- Void sheet: [VoidSheet.tsx](SubsTrack/src/modules/payments/components/VoidSheet.tsx)
- Service: [PaymentService.ts](SubsTrack/src/modules/payments/services/PaymentService.ts)
- Store: [paymentStore.ts](SubsTrack/src/modules/payments/store/paymentStore.ts)
- Repository: [PaymentRepository.ts](SubsTrack/src/modules/payments/repository/PaymentRepository.ts)

---

## 0. Critical invariants

These are non-negotiable and should be re-verified after any release:

1. **Amount is a snapshot.** Editing a plan's price NEVER recomputes existing payments.
2. **Hard delete is forbidden.** A bad payment is voided via `voided_at` + `voided_by` + `notes`.
3. **One non-voided payment per (customer, billing_month).** Enforced by service AND DB unique index `uq_payments_customer_month_active`.
4. **billing_month must be `YYYY-MM-01`.** Validated in service.
5. **`amount > 0` always.** No zero, no negative.
6. **Tenant isolation.** Payment row's `tenant_id` always equals the current tenant's id.
7. **Voided payments are excluded** from the year fetch and from "paid this month" queries.

## 1. Tapping a month cell — entry router

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Tap a paid month | Customer has a non-voided payment for that month | `PaymentDetailSheet` opens (read-only receipt with amount, date, ID, notes) |
| 1.2 | Tap an unpaid current month | Active customer, no payment | `PaymentFormSheet` opens |
| 1.3 | Tap an unpaid past month | Active customer, prior month with no payment | `PaymentFormSheet` opens |
| 1.4 | Tap a future month — active customer | Active customer | `PaymentFormSheet` opens (future payment is allowed) |
| 1.5 | Tap a future month — inactive customer | Inactive customer | Info popup: "This customer is inactive. Future month payments cannot be recorded for inactive customers." Sheet does NOT open |
| 1.6 | Tap a before-start month | Month < customer.start_date | Info popup: "This month is before the customer's start date. No payment can be recorded here." |
| 1.7 | Repeated rapid taps | Tap a cell 3 times fast | Only one sheet opens (modal animation absorbs subsequent taps) |
| 1.8 | Tap then immediately scroll | Tap a cell, scroll the grid | Sheet still opens correctly; no orphaned overlays |

## 2. Scenario A — Fixed plan (price pre-filled, locked)

Triggered when `customer.plan` exists and `plan.isCustomPrice = false`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Default amount display | Open form for a fixed-plan customer | Large amount card shows the plan's price (e.g. "$50.00"). No editable input. "Override amount" link visible below |
| 2.2 | Customer mini-header | Look at the form | Avatar + customer name + "<MonthLabel> <Year> · <PlanName>" |
| 2.3 | Notes optional | Leave Notes blank, submit | Payment created with notes = null |
| 2.4 | Notes filled | Type "Cash collected", submit | Payment.notes = "Cash collected" (trimmed) |
| 2.5 | "Mark as paid" | Tap submit | Payment created with `amount = plan.price`, planId set, customer's grid cell turns green immediately |
| 2.6 | After save: form resets | Close and re-open form for another month | Notes / override state cleared |
| 2.7 | Receipt-id hint | Below the button | "Receipt ID generated automatically" |

## 3. Scenario B — Override on a fixed plan

Triggered when the user taps "Override amount" inside Scenario A.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open override mode | Tap "Override amount" | Two radios appear: "Plan price ($X)" (selected by default) and "Custom amount" |
| 3.2 | Plan-price radio | Submit with "Plan price" selected | amount = plan.price (same as Scenario A) |
| 3.3 | Custom radio | Tap "Custom amount" | A numeric input appears below the radios |
| 3.4 | Custom amount input | Enter `42.50`, submit | amount = 42.50 |
| 3.5 | Custom amount = 0 | Enter `0` | "Mark as paid" button stays disabled |
| 3.6 | Custom amount negative | Enter `-5` | Button disabled (parseFloat works, but `> 0` fails) |
| 3.7 | Custom amount empty | Leave field empty after picking custom | Button disabled |
| 3.8 | Switch back to plan radio | After typing a custom amount, switch back | Submit uses plan price; the typed custom value is ignored |
| 3.9 | Decimal precision | Enter `12.345` | parseFloat keeps `12.345`; persisted as numeric(12,2) — DB rounds to 12.35 (verify behavior) |
| 3.10 | Comma decimals | Type `12,50` | parseFloat returns NaN — button disabled. (UX consideration only.) |

## 4. Scenario C — Fully custom (no plan or custom-price plan)

Triggered when `customer.plan` is null OR `plan.isCustomPrice = true`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | No plan | Open form for a customer with no plan | Single "Enter amount" input, no plan-price radio |
| 4.2 | Custom-price plan | Open form for a customer on a custom-price plan | Same as 4.1; plan name still shown in header |
| 4.3 | Submit valid amount | Enter `25`, submit | Payment created, amount = 25, planId is the plan's id (or null) |
| 4.4 | Empty amount | Leave blank | Submit disabled |
| 4.5 | Zero amount | Enter `0` | Submit disabled |
| 4.6 | Negative amount | Enter `-1` | Submit disabled |
| 4.7 | Letters in amount | Type `abc` | Field accepts the keystrokes (decimal-pad on iOS may filter); parseFloat = NaN; submit disabled |
| 4.8 | Notes optional | Leave blank or fill | Persisted accordingly |

## 5. Submission, persistence and grid update

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | After successful save | Submit any payment | Sheet closes, MonthCell turns green, year card "paid" count increments, "collected" total increments |
| 5.2 | In-flight guard | Double-tap "Mark as paid" | `loadingCreate` flag blocks duplicate submission |
| 5.3 | DB unique violation | Manually insert duplicate via two devices for same (customer, month) | Service catches `uq_payments_customer_month_active`, surfaces "A payment already exists for this customer and month" — sheet stays open |
| 5.4 | Network error | Disable network, submit | ErrorBanner: "Connection error. Please try again." Sheet stays open with values |
| 5.5 | Receipt id format | After save, open the just-paid month | Receipt ID shown is the last 6 chars of payment.id, uppercased |
| 5.6 | Persistence across refresh | Save, pull-to-refresh detail screen | Payment still present, status remains paid |
| 5.7 | Persistence across reopen | Save, navigate back to list, return | Grid still shows the cell green |
| 5.8 | tenant_id stamped automatically | Inspect the new row | `tenant_id` matches the logged-in user's tenant |
| 5.9 | received_by_user_id | Inspect the new row | Equals the current user's id |
| 5.10 | plan_id snapshot | Customer has plan A, save payment, change customer's plan to B | The saved payment still has plan_id = A's id (snapshot preserved unless plan A is later deleted, which sets it to null) |

## 6. Paid-month receipt sheet

Tapping a green cell opens this read-only sheet.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Receipt header | Open | "Payment receipt" title, "Close" link |
| 6.2 | Hero amount | Look at the green card | Amount in `$X.XX` with two decimals, "<Month> <Year> · paid in full" subtitle |
| 6.3 | Paid on row | Detail rows | Localized formatted date of `paidAt` |
| 6.4 | Receipt ID row | Detail rows | Last 6 chars of payment.id, uppercased |
| 6.5 | Notes row visibility | Payment has notes | Row visible with the saved note text |
| 6.6 | Notes row hidden | Payment has no notes | Row not rendered |
| 6.7 | Edit button visibility — fixed plan | Customer is on a fixed plan | "Edit Amount" button is HIDDEN (snapshot price stays) |
| 6.8 | Edit button visibility — custom plan | Customer is on a custom-price plan or no plan | "Edit Amount" button visible |
| 6.9 | Void button | Visible | "Void this payment" button shown (admin must perform) |

## 7. Edit amount (custom payment only)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Open edit | Tap "Edit Amount" | Inline numeric input prefilled with current amount; Cancel and Save Changes buttons |
| 7.2 | Cancel | Tap Cancel | Returns to read-only mode, no change |
| 7.3 | Save with same amount | Save unchanged | Payment row updated (no-op visually) |
| 7.4 | Save with new amount | Type 99, save | amount updated to 99; year card collected total updates |
| 7.5 | Save with 0 | Type 0 | Save Changes button is disabled |
| 7.6 | Save with negative | Type -1 | Save Changes button disabled |
| 7.7 | Save with empty | Clear field | Save Changes button disabled |
| 7.8 | Loading state | Slow network on save | Button shows "..." while in-flight |
| 7.9 | Network error | Save with no internet | ErrorBanner inside detail sheet (verify behavior — error is on payment store) |
| 7.10 | Voided payment cannot be edited | Try to edit a payment that is voided | The repository updateAmount filters `is('voided_at', null)`, so update fails — no UI access since voided payments don't render in the grid |

## 8. Void flow

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Open void sheet | On receipt, tap "Void this payment" | Receipt closes, Void sheet opens. Header in red |
| 8.2 | Warning banner | Look at the banner | Lists `<Month> <Year> will be marked unpaid... voids cannot be undone.` |
| 8.3 | Reason required | Leave reason empty | Void button is disabled |
| 8.4 | Whitespace-only reason | Type `"   "` | Service rejects with "A reason is required to void a payment" — verify button is disabled or service returns error inline |
| 8.5 | Confirm dialog | Type a reason, tap Void | Confirmation dialog: "Void Payment?" with destructive style. Buttons: confirm (Void) / cancel |
| 8.6 | Cancel confirm | Tap Cancel | Returns to Void sheet, reason still typed |
| 8.7 | Confirm void | Tap Void | Backend sets voided_at, voided_by, notes; grid cell reverts to UNPAID (or FUTURE if grace applies); year card paid/collected drop |
| 8.8 | Audit trail preserved | Inspect DB after void | Row still exists with voided_at, voided_by, notes (the reason). Customer's balance no longer counts it |
| 8.9 | Same month re-payable | After voiding, tap the same month | Form opens — previous payment is invisible; new payment can be recorded |
| 8.10 | Loading state | Slow network | "..." shown on the Void button |
| 8.11 | Network error | Disable network, confirm | ErrorBanner inside sheet; payment NOT voided |
| 8.12 | Permission gating | Logged in as user role | Void path may still be exposed; per spec, void is admin-only — verify gate at service or UI level (currently UI does not hide the void button — file as a finding if user role can void) |

## 9. Cross-year and cross-month interactions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Pay then navigate years | Pay May, navigate to last year, back | New payment still rendered; year totals correct |
| 9.2 | Void then navigate | Void June 2025, navigate to 2025 | June 2025 cell shows UNPAID (assuming past month) |
| 9.3 | Future-year navigation | Navigate to year 2030 | All cells show FUTURE; payments still recordable for active customers |
| 9.4 | Year fetch caching | Repeatedly switch between two years | Each switch re-fetches that year's payments (no stale rows) |
| 9.5 | Concurrent payment from two devices | Device A and B both try to pay same (customer, month) | Only one succeeds — the second sees "A payment already exists for this customer and month" |

## 10. Grace period

`PaymentService.buildMonthGrid` accepts `graceDays`. The current screen uses `DEFAULT_GRACE_DAYS = 0` (see [CustomerDetailScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerDetailScreen.tsx)).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | graceDays = 0 (default) | First day of month, no payment | Cell is UNPAID immediately |
| 10.2 | graceDays = 5 (when configurable) | Day 3 of month, no payment | Cell shows FUTURE (within grace) — verify when grace is wired to tenant config |
| 10.3 | graceDays = 5, day 10 | Day 10 of month, no payment | Cell is UNPAID |
| 10.4 | Grace edge — exact cutoff | Day = grace cutoff (today == firstOfMonth + graceDays) | Cell is FUTURE (uses `<=`) |
| 10.5 | Grace edge — day after cutoff | Today > grace cutoff | Cell is UNPAID |

## 11. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Customer's plan changes between payments | Save payment in May with plan A, change plan to B in June, save June | Each payment retains its plan_id snapshot |
| 11.2 | Plan deleted after payment | Save payment, admin deletes that plan | DB sets `plan_id` of the payment to null; receipt still shows amount, planName falls back to "No plan" header on detail screen |
| 11.3 | Customer deleted (hard delete forbidden) | Try to remove customer | Should not be possible — only deactivate. If somehow forced, payments cascade-delete via DB FK |
| 11.4 | Time zone boundaries | Pay on the last second of a day in a non-UTC timezone | billing_month is the chosen month's first day (no off-by-one). Verify by checking the grid cell renders in the right month |
| 11.5 | Decimal precision rounding | Save 12.345 | DB stores 12.35 (2 dp). UI shows 12.35 |
| 11.6 | Very large amount | Enter 999999999999.99 (numeric(12,2) max) | Saved. Receipt formats correctly |
| 11.7 | Beyond column max | Enter 9999999999999.99 (one digit too many) | Backend rejects — surface error message |
| 11.8 | Notes max length | Enter 5000-char notes | Backend column likely permits; verify no client crash. UI may truncate display |
| 11.9 | Notes with newlines | Multiline notes | Persisted; receipt row displays them (may wrap) |
| 11.10 | Voided payment in legacy data | Customer with a voided payment for current month | "Paid this month?" badge on customer card returns false (uses non-voided) |
| 11.11 | Open grid right after creating customer | New customer, immediately tap an unpaid month | Form loads with correct customer name and current plan info |
| 11.12 | Form sheet auto-dismiss | After saving, the sheet calls `onDismiss` | Verify keyboard hides cleanly and there is no flicker |
| 11.13 | Cancel during edit-amount mode on receipt | Press Cancel inside edit mode | Returns to read-only receipt; close X also works |
| 11.14 | Grace boundary on first of month at midnight | At 00:00:00 of day 1 | grace logic uses local "today"; cell is FUTURE if graceDays >= 0 |
| 11.15 | Voided payment older than current view year | Year switch to 2024, payment in 2024 was voided | Cell renders UNPAID (since the voided row is filtered out) |

## 12. Permissions matrix

| Operation | Admin | User |
|-----------|-------|------|
| Open paid receipt | ✓ | ✓ |
| Record payment | ✓ | ✓ |
| Edit amount on custom payment | ✓ | ✓ (gated only by plan type, not role currently) |
| Void payment | ✓ | ⚠ Verify enforcement — UI does not currently hide |

(File any role-leak as a release blocker.)
