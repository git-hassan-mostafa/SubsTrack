# Payments — QA Scenarios

Covers everything that happens when a user taps a month cell or uses Quick Pay: recording a payment (Scenarios A / B / C / D), partial payments, multi-month bundles, currency selection, the receipt sheet (with edit + void), and the void flow. Voids are soft (audit-preserved). The month-grid status logic is documented separately in [monthly-grid.md](monthly-grid.md). Currency CRUD and the display-currency preference are in [currencies.md](currencies.md).

**Reference code:**
- Form sheet: [PaymentFormSheet.tsx](SubsTrack/src/modules/customer-payments/components/PaymentFormSheet.tsx)
- Partial / full selector: [PaymentAmountPaidSection.tsx](SubsTrack/src/modules/customer-payments/components/PaymentAmountPaidSection.tsx)
- Detail sheet (receipt): [PaymentDetailSheet.tsx](SubsTrack/src/modules/customer-payments/components/PaymentDetailSheet.tsx)
- Void sheet: [VoidSheet.tsx](SubsTrack/src/modules/customer-payments/components/VoidSheet.tsx)
- Customer-list quick-pay logic: [CustomerListScreen.tsx](SubsTrack/src/modules/customers/screens/CustomerListScreen.tsx)
- Service: [PaymentService.ts](SubsTrack/src/modules/customer-payments/services/PaymentService.ts)
- Store: [paymentStore.ts](SubsTrack/src/modules/customer-payments/store/paymentStore.ts)
- Repository: [PaymentRepository.ts](SubsTrack/src/modules/customer-payments/repository/PaymentRepository.ts)
- Currency utils: [currency.ts](SubsTrack/src/core/utils/currency.ts)

---

## 0. Critical invariants

These are non-negotiable and should be re-verified after any release:

1. **Amounts are snapshots.** Editing a plan's price NEVER recomputes existing payments. Editing a currency's `rate_per_usd` NEVER shifts the USD equivalent of historical payments — they convert via `rate_per_usd_snapshot` frozen at record time.
2. **Hard delete is forbidden for payments.** A bad payment is voided via `voided_at` + `voided_by` + `notes`.
3. **One non-voided payment per (customer, billing_month).** Enforced by service AND DB unique index. Multi-month payments cover several months from a single row.
4. **billing_month must be `YYYY-MM-01`.** Validated in service.
5. **`amount_due > 0`, `amount_paid >= 0`, `amount_paid <= amount_due`.** Always.
6. **`rate_per_usd_snapshot > 0`.** USD payments (`currencyId === null`) store snapshot = 1.
7. **Tenant isolation.** Payment row's `tenant_id` always equals the current tenant's id.
8. **Voided payments are excluded** from the year fetch, from "paid this month" queries, and from multi-month coverage.
9. **Payment with `amount_paid = 0` is unpaid.** Slot is reserved but the month grid shows it as unpaid (see [monthly-grid.md](monthly-grid.md)).

## 1. Tapping a month cell — entry router

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Tap a paid month | Customer has a non-voided payment for that month | `PaymentDetailSheet` opens (read-only receipt) |
| 1.2 | Tap a partial-paid month | Payment exists with `balance > 0` | Receipt opens with amber theme, balance row visible, "Balance remaining: $X" badge |
| 1.3 | Tap an unpaid current month | Active customer, no payment | `PaymentFormSheet` opens, current month highlighted in form header |
| 1.4 | Tap an unpaid past month | Active customer, prior month with no payment | `PaymentFormSheet` opens |
| 1.5 | Tap a future month — active customer | Active customer | `PaymentFormSheet` opens (future payment allowed) |
| 1.6 | Tap a future month — inactive customer | Inactive customer | Inline amber banner in the sheet: "This customer is inactive. Future month payments cannot be recorded for inactive customers." Submit disabled |
| 1.7 | Tap a before-start month | Month < customer.start_date | Info popup: "This month is before the customer's start date. No payment can be recorded here." |
| 1.8 | Tap a `isGroupSecondary` cell (multi-month included) | Tap a month covered as month 2+ in a bundle | Opens the original payment's receipt (the source `billingMonth`), not the form |
| 1.9 | Repeated rapid taps | Tap a cell 3 times fast | Only one sheet opens (modal animation absorbs subsequent taps) |
| 1.10 | Tap then immediately scroll | Tap a cell, scroll the grid | Sheet still opens correctly; no orphaned overlays |

## 2. Scenario A — Fixed single-month plan (price locked)

Triggered when `customer.plan` exists, `plan.isCustomPrice = false`, and `plan.durationMonths === 1`.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Default amount display | Open form for a fixed-plan customer | "Amount" card shows `plan.price` formatted in `plan.currency` (e.g. "$50.00" or "50,000 LBP"). No editable input. "Override amount" link below |
| 2.2 | Customer mini-header | Look at the form | Avatar + customer name + "<MonthLabel> <Year> · <PlanName>" |
| 2.3 | Notes optional | Leave Notes blank, submit | Payment created with notes = null |
| 2.4 | Notes filled | Type "Cash collected", submit | Payment.notes = "Cash collected" (trimmed) |
| 2.5 | Submit Full payment | Tap "Mark as paid" with Full selected (default) | `amount_due = amount_paid = plan.price`, `currency_id = plan.currencyId`, `rate_per_usd_snapshot = plan.currency.ratePerUsd` (or 1 for USD), cell turns green |
| 2.6 | Submit Partial payment | Toggle "Partial", enter amount lower than plan price, submit | `amount_due = plan.price`, `amount_paid = typed`, `balance = due - paid`, cell turns amber ("PARTIAL" status, "PARTIAL" sublabel) |
| 2.7 | Partial amount equals due | Enter Partial value equal to plan.price | Treated as full payment (balance = 0), no orange dot |
| 2.8 | Partial amount exceeds due | Enter Partial value > plan.price | Submit button disabled (validation: `amount_paid <= amount_due`) |
| 2.9 | Partial amount = 0 | Enter Partial = 0 | Submit disabled (validation: `amount_paid > 0` for grid to show paid) — verify exact rule (service allows `>= 0` but month shows unpaid) |
| 2.10 | Form resets between opens | Save, reopen for a different month | All state cleared: notes, override, partial mode |

## 3. Scenario B — Override on a fixed single-month plan

Triggered when the user taps "Override amount" inside Scenario A. Adds a "Plan price" vs "Custom amount" radio plus a `CurrencyInput` for the custom branch.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Open override mode | Tap "Override amount" | Two radios appear: "Plan price ($X)" (selected by default) and "Custom amount" |
| 3.2 | Plan-price radio | Submit with "Plan price" selected | Same as Scenario A — `amount_due = plan.price` in plan's currency |
| 3.3 | Custom radio reveals CurrencyInput | Tap "Custom amount" | `CurrencyInput` appears below (amount field + currency dropdown listing USD + active tenant currencies) |
| 3.4 | Custom amount input | Enter `42.50`, leave currency = USD, submit | `amount_due = amount_paid = 42.50`, `currency_id = null`, snapshot = 1 |
| 3.5 | Custom amount in tenant currency | Enter `100000` and pick LBP | `currency_id = LBP_id`, `rate_per_usd_snapshot = LBP.ratePerUsd at submit time` |
| 3.6 | Custom amount = 0 | Enter `0` | Submit stays disabled (amount must be > 0) |
| 3.7 | Custom amount negative | Type a negative number | Submit disabled / DecimalPad blocks `-` |
| 3.8 | Empty after switching to Custom | Tap Custom, leave amount blank | Submit disabled |
| 3.9 | Switch back to Plan radio | After typing a custom amount, switch back | Submit uses plan price; typed custom value ignored. Switching also resets paymentMode back to "full" |
| 3.10 | Decimal precision | Enter `12.345` | parseFloat keeps `12.345`; DB rounds to currency `decimals` |
| 3.11 | Switching currency does NOT convert | Type `100`, switch dropdown from USD to LBP | Field still shows `100` (now interpreted as 100 LBP) — switching = "I meant the same number in the new unit" |
| 3.12 | Currency change clears partial paid | After typing partial, switch currency | Amount Paid in the lower section is cleared (was in the old unit) |
| 3.13 | Partial in custom currency | Custom amount = `100 LBP`, partial = `60 LBP` | `amount_due = 100, amount_paid = 60, currency_id = LBP, snapshot = LBP.ratePerUsd` |

## 4. Scenario C — Fully custom (no plan or custom-price plan)

Triggered when `customer.plan` is null OR `plan.isCustomPrice = true`. Same `CurrencyInput` shown without the override toggle.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | No plan | Open form for a customer with no plan | Single `CurrencyInput` for amount; no plan-price radio |
| 4.2 | Custom-price plan | Open form for a customer on a custom-price plan | Same as 4.1; plan name still shown in header |
| 4.3 | Submit valid USD amount | Enter `25`, submit | Payment created, `amount_due = amount_paid = 25`, currency_id = null |
| 4.4 | Submit in non-USD | Pick LBP, enter `50000`, submit | currency_id = LBP_id, snapshot = LBP.ratePerUsd |
| 4.5 | Empty amount | Leave blank | Submit disabled |
| 4.6 | Zero amount | Enter `0` | Submit disabled |
| 4.7 | Negative amount | Enter `-1` | Submit disabled |
| 4.8 | Letters in amount | Type `abc` | Field accepts (decimal-pad may filter); parseFloat = NaN; submit disabled |
| 4.9 | Last-used currency persists | Submit in LBP, reopen form for another customer | CurrencyInput defaults to LBP (last-used in `uiPrefStore`) |
| 4.10 | Partial payment Scenario C | Enter `100`, toggle Partial, enter `40` | `amount_due = 100, amount_paid = 40, balance = 60` |
| 4.11 | Quick Pay handshake (Scenario C) | From customer list, tap menu → Pay Now on a no-plan / custom-price customer | Route `/(app)/(tabs)/customers/[id]?quickPay=1`. Detail screen auto-opens PaymentFormSheet for current month |
| 4.12 | Quick Pay param cleared after open | After 4.11, refresh / navigate back | `?quickPay=1` is removed from the URL so it doesn't re-fire |

## 5. Scenario D — Multi-month bundle (fixed plan, durationMonths > 1)

Triggered when `customer.plan` exists, `plan.isCustomPrice = false`, `plan.durationMonths > 1`. Amount card shows the locked bundle price + a row of month chips for each month in the range.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | Multi-month card displays | Open form for a customer on a 3-month plan | Amount card shows `plan.price` with subtitle "/ 3 months". Below it: 3 chips labelled Jan, Feb, Mar (or whatever month range starts at tap) |
| 5.2 | Submit Full multi-month | Tap "Mark as paid" with Full | 1 payment row created with `duration_months = 3, amount_due = plan.price, amount_paid = plan.price`. Grid shows 3 consecutive paid cells (month 2 + 3 have `isGroupSecondary = true`, "Included" sublabel) |
| 5.3 | Multi-month receipt | Tap any of the 3 covered cells | Receipt opens with title "Payment block receipt" and a green badge "Covers 3 months" |
| 5.4 | Submit Partial multi-month | Toggle Partial, enter amount < plan.price | One payment row created with the partial amount; `balance > 0`. Source cell turns amber ("PARTIAL" sublabel); secondary cells (isGroupSecondary) also amber with "Included" sublabel; receipt uses amber theme |
| 5.5 | Conflict detection | Tap a multi-month start where one or more of the covered months is already paid | Amber warning banner: "Some months already paid: <list>. Proceed and skip them?" Submit disabled until user taps "Proceed anyway" |
| 5.6 | Proceed past conflicts | Tap "Proceed anyway", submit | Skipped months are skipped; the recorded payment starts at the first uncovered month and covers only the remaining range. Conflict month chips show line-through and gray |
| 5.7 | All months covered | Try to multi-month into a range where every month is paid | Either button stays disabled, or service throws "All months already paid" — verify the surface |
| 5.8 | Quick Pay multi-month confirmation | From customer list, menu → Pay Now on a multi-month plan customer | `ConfirmDialog` opens: "Pay <amount> covering <Jan–Mar 2026>? Confirm/Cancel". On Confirm, runs `createMultiMonthPayment` directly without opening the form |
| 5.9 | Quick Pay multi-month cancel | Tap Cancel on the dialog | No payment recorded, list unchanged |
| 5.10 | Multi-month void | Open receipt on any of the 3 cells, tap "Void this block" | All 3 cells revert to unpaid in a single operation |
| 5.11 | Multi-month with custom-price plan | Plan has `isCustomPrice = true` AND `durationMonths > 1` | Should be impossible by validation — multi-month plans require fixed price. Verify [PlanService.validate](SubsTrack/src/modules/plans/services/PlanService.ts) enforces this |
| 5.12 | Multi-month currency | Plan has `currency_id = LBP` | Bundle price displayed in LBP; payment row stored with `currency_id = LBP, rate_per_usd_snapshot = LBP.ratePerUsd at submit` |
| 5.13 | Multi-month spanning year boundary | Open multi-month for Dec on a 3-month plan | Payment row stored with `billing_month = YYYY-12-01, duration_months = 3`. Grid in year Y shows Dec paid; navigating to year Y+1 shows Jan + Feb paid with `isGroupSecondary = true` |

## 6. Amount Paid section (Full vs Partial)

Lives just above the submit button in `PaymentFormSheet` via `PaymentAmountPaidSection`. Default mode = Full.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Default Full | Open any form | "Full" radio selected, no Amount Paid input shown |
| 6.2 | Switch to Partial | Tap "Partial" | Amount Paid `CurrencyInput` appears, currency LOCKED to the resolved due currency (cannot be switched) |
| 6.3 | Switch back to Full | After typing partial, tap Full | Amount Paid cleared, button label flips to "Mark as paid" |
| 6.4 | Partial when due not set | Open a Scenario C form, no amount typed yet, try to switch to Partial | Partial option disabled until Amount Due > 0 |
| 6.5 | Submit button label | Partial with `amount_paid < amount_due` | Button label = "Record payment" (not "Mark as paid"), to reflect the balance remaining |

## 7. Submission, persistence and grid update

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | After successful save | Submit any payment | Sheet closes, MonthCell turns green (or amber-dotted for partial), year card counts/totals update |
| 7.2 | In-flight guard | Double-tap "Mark as paid" | `loadingCreate` flag blocks duplicate submission |
| 7.3 | DB unique violation | Two devices submit for same (customer, month) | Service catches the unique-index error, surfaces a friendly message |
| 7.4 | Network error | Disable network, submit | ErrorBanner inside the sheet; sheet stays open with values |
| 7.5 | Receipt ID format | After save, open the just-paid month | Receipt ID = last 6 chars of payment.id, uppercased |
| 7.6 | Persistence across refresh | Save, pull-to-refresh detail screen | Payment still present |
| 7.7 | tenant_id stamped automatically | Inspect the new row | `tenant_id` matches the logged-in user's tenant |
| 7.8 | received_by_user_id | Inspect the new row | Equals the current user's id |
| 7.9 | plan_id snapshot | Customer has plan A, save, change customer's plan to B | The saved payment still has plan_id = A's id |
| 7.10 | currency_id + snapshot stamped | Submit in LBP at rate 90000 | `currency_id = LBP_id, rate_per_usd_snapshot = 90000`. Later editing LBP.ratePerUsd to 100000 does NOT change snapshot |

## 8. Receipt sheet (paid-month detail)

Tapping a green cell (or any `isGroupSecondary` cell) opens this sheet. Theme = green for full, amber for partial.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | Header — single-month | Open a single-month payment | Title "Payment receipt", "Close" link |
| 8.2 | Header — multi-month | Open a multi-month payment | Title "Payment block receipt", "Close" link |
| 8.3 | Hero amount full | Payment with balance = 0 | Green card, big amount in stored currency, subtitle "<Month/Range> paid in full" |
| 8.4 | Hero amount partial | Payment with balance > 0 | Amber card, big amount = `amount_paid`, "Paid (partial)" subtitle, "Balance remaining: <X>" line |
| 8.5 | Displays in stored currency primarily | Payment in LBP, user's display currency is USD | Primary line shows LBP amount; secondary "≈ $X.XX" line appears below |
| 8.6 | Equivalent uses snapshot rate | Edit LBP live rate on Settings after recording | Receipt USD equivalent does NOT change (uses `rate_per_usd_snapshot`) |
| 8.7 | Multi-month badge | Multi-month payment | Pill at the bottom of the hero card: "Covers N months" |
| 8.8 | Detail rows visible | Always | Paid on / Receipt ID / Amount Due / Amount Paid rows shown |
| 8.9 | Balance row | Payment with balance > 0 | Row "Balance: <X>" in amber color |
| 8.10 | Notes row visibility | Payment has notes | Row visible with note text |
| 8.11 | Notes row hidden | Payment has no notes | Row not rendered |
| 8.12 | Edit Payment button | Always visible when `onEdit` is wired (now visible for fixed plans too — currency may have been wrong) | "Edit Payment" button visible. Multi-month payments also editable (amounts + currency) |
| 8.13 | Void button | Always visible while admin permission permits | "Void this payment" / "Void this block" depending on duration |
| 8.14 | Voided payment | Trying to open a voided payment | Voided payments are filtered out of the year fetch; they don't appear as receipt entry points. Verify |

## 9. Edit payment

Edit re-snapshots `rate_per_usd_snapshot` from the currency live rate at edit time ("user fixing the record" semantic).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Open edit | Tap "Edit Payment" on receipt | Inline: Amount Due `CurrencyInput` (currency unlocked) + Amount Paid `CurrencyInput` (currency locked to Due's) + Cancel + Save Changes |
| 9.2 | Cancel | Tap Cancel | Returns to read-only mode, no change |
| 9.3 | Save same values | Save unchanged | Payment row updated; UI no-op |
| 9.4 | Edit amount due | Change Due from `50` to `60` (Paid auto-stays = 60 if was full) | `amount_due = 60`. Receipt updates; year-total updates |
| 9.5 | Edit amount paid | Change Paid from `50` to `30` | `amount_paid = 30, balance = 30`. Receipt switches to amber theme. Cell switches from green/yellow to amber ("PARTIAL" status) |
| 9.6 | Edit currency | Switch the Amount Due CurrencyInput from USD to LBP | Amount Paid is cleared (was in USD). User must re-enter Paid in LBP |
| 9.7 | Save after currency change | Switch to LBP, enter new amounts, save | `currency_id = LBP_id, rate_per_usd_snapshot = LBP.ratePerUsd at THIS save's moment` (re-snapshot) |
| 9.8 | Save with paid > due | Try to save with paid > due | Save Changes button disabled (validation) |
| 9.9 | Save with due = 0 | Try | Disabled |
| 9.10 | Save with due empty | Try | Disabled |
| 9.11 | Save with paid empty | Try | Disabled |
| 9.12 | Loading state | Slow network on save | Save button shows "..." while in-flight |
| 9.13 | Network error | Save with no internet | ErrorBanner inside detail sheet; values preserved |
| 9.14 | Voided payment cannot be edited | Edit a voided payment via API | Repository's `updatePayment` filters `voided_at IS NULL`; update returns 0 rows / error. No UI access |
| 9.15 | Edit multi-month payment | Edit a payment with duration_months > 1 | Amounts + currency editable; `duration_months` is NOT editable (locked). For range corrections: void + re-record |

## 10. Void flow

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Open void sheet | On receipt, tap "Void this payment" / "Void this block" | Receipt closes, Void sheet opens with red header |
| 10.2 | Warning banner | Look at the banner | Lists `<Month/Range> will be marked unpaid... voids cannot be undone.` For multi-month, lists all covered months |
| 10.3 | Reason required | Leave reason empty | Void button disabled |
| 10.4 | Whitespace-only reason | Type `"   "` | Service rejects: "A reason is required to void a payment" |
| 10.5 | Confirm dialog | Type a reason, tap Void | `ConfirmDialog`: "Void Payment?" destructive style |
| 10.6 | Cancel confirm | Tap Cancel | Returns to Void sheet, reason still typed |
| 10.7 | Confirm void single-month | Tap Void | Sets `voided_at, voided_by, notes`. Grid cell reverts to UNPAID / FUTURE |
| 10.8 | Confirm void multi-month | Void a 3-month block | All 3 covered cells revert in a single operation (one row voided) |
| 10.9 | Audit trail preserved | Inspect DB after void | Row still exists with voided_at, voided_by, notes. Customer's balance no longer counts it |
| 10.10 | Same month re-payable | After voiding, tap the same month | Form opens — previous payment invisible; new payment can be recorded |
| 10.11 | Loading state | Slow network | "..." shown on the Void button |
| 10.12 | Network error | Disable network, confirm | ErrorBanner inside sheet; payment NOT voided |
| 10.13 | Permission gating | Logged in as user role | Void path may still be exposed; per spec, void is admin-only — verify gate at service or UI level (file as a finding if user role can void) |

## 11. Cross-year and cross-month interactions

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | Pay then navigate years | Pay May, navigate to last year, back | New payment still rendered; year totals correct |
| 11.2 | Void then navigate | Void June 2025, navigate to 2025 | June 2025 cell shows UNPAID |
| 11.3 | Future-year navigation | Navigate to year 2030 | All cells show FUTURE; payments still recordable for active customers |
| 11.4 | Year fetch caching | Repeatedly switch between two years | Each switch re-fetches that year's payments (no stale rows) |
| 11.5 | Multi-month payment visible from both years | Pay Nov–Jan multi-month | Year Y shows Nov + Dec paid. Year Y+1 shows Jan paid (isGroupSecondary). Receipt accessible from any of the 3 cells |
| 11.6 | Concurrent payment from two devices | Both try to pay same (customer, month) | Only one succeeds — the second sees the unique-violation error |

## 12. Grace period

`PaymentService.buildMonthGrid` accepts `graceDays`. The value comes from the tenant's current `TierPlan.graceDays`, read via the `useGraceDays()` selector hook from `subscriptionStore`. Defaults are Free = 0, Pro = 3, Business = 7 (editable from SuperAdmin's tier-plans editor).

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | graceDays = 0 (default) | First day of month, no payment | Cell is UNPAID immediately |
| 12.2 | graceDays = 5 (when configurable) | Day 3 of month, no payment | Cell shows FUTURE (within grace) |
| 12.3 | graceDays = 5, day 10 | Day 10 of month, no payment | Cell is UNPAID |
| 12.4 | Grace edge — exact cutoff | Day = grace cutoff | Cell is FUTURE (uses `<=`) |
| 12.5 | Grace edge — day after cutoff | Today > grace cutoff | Cell is UNPAID |

## 13. Currency and snapshot semantics

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | USD payment stores null currency_id | Submit a USD payment | `currency_id = NULL, rate_per_usd_snapshot = 1` |
| 13.2 | Tenant currency payment | Submit a LBP payment at rate 90000 | `currency_id = LBP_id, rate_per_usd_snapshot = 90000` |
| 13.3 | Live rate edit does not shift history | Submit at rate 90000, then admin edits LBP.ratePerUsd to 100000 | Old payment's USD equivalent on receipt still uses 90000 |
| 13.4 | Edited payment re-snapshots | Edit an old LBP payment after rate change | New `rate_per_usd_snapshot = 100000` (or whatever is live at edit time) |
| 13.5 | Display currency conversion | User's display currency = EUR | Receipts show stored amount first, then `≈ EUR equivalent` via snapshot rate |
| 13.6 | Year totals use snapshot | Open `CustomerPaymentPanel` for a customer with mixed-currency payments | Year total shows the USD-converted sum (via each payment's snapshot), formatted in user's display currency |

## 14. Edge cases

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 14.1 | Customer's plan changes between payments | Save May with plan A, change plan to B in June, save June | Each payment retains its `plan_id` snapshot |
| 14.2 | Plan deleted after payment | Save payment, admin deletes the plan | DB sets `plan_id = NULL` on payment; receipt still shows amount; header falls back to "No plan" |
| 14.3 | Currency deleted while in use | Try to delete a currency referenced by any plan/payment | `CurrencyService.deleteCurrency()` soft-deletes (sets `active = false`); FK `ON DELETE RESTRICT` would block hard-delete attempts |
| 14.4 | Time zone boundaries | Pay on the last second of a day in a non-UTC timezone | billing_month is the chosen month's first day (no off-by-one). Verify by checking the grid cell renders in the right month |
| 14.5 | Decimal precision rounding | Save 12.345 in USD | DB stores 12.35 (2 dp). UI shows 12.35 |
| 14.6 | LBP (0 decimals) | Save 50000.7 in LBP | Stored as 50001 (LBP.decimals = 0) |
| 14.7 | Very large amount | Enter near-max bigint | Saved correctly; receipt formats |
| 14.8 | Notes max length | Enter 5000-char notes | Backend column likely permits; verify no client crash |
| 14.9 | Notes with newlines | Multiline notes | Persisted; receipt row displays them (may wrap) |
| 14.10 | Voided payment in legacy data | Customer with a voided payment for current month | "Paid this month?" badge returns false |
| 14.11 | Open grid right after creating customer | New customer, immediately tap an unpaid month | Form loads with correct customer name and current plan info |
| 14.12 | Form sheet auto-dismiss | After saving, sheet calls `onDismiss` | Keyboard hides cleanly, no flicker |
| 14.13 | amount_paid = 0 means unpaid | Save with `amount_paid = 0` (if allowed) | Cell renders UNPAID in the grid — the slot is reserved but not paid |
| 14.14 | Quick Pay on inactive customer | Try to Quick Pay an inactive customer | Quick Pay action hidden from the menu (`shouldShowQuickPay` returns false) |
| 14.15 | Quick Pay before customer's start date | start_date > today | Quick Pay action hidden |
| 14.16 | Quick Pay on already-paid current month | Already paid | Quick Pay action hidden |
| 14.17 | Quick Pay on non-regular customer | `isRegular = false` | Quick Pay action hidden |

## 15. Permissions matrix

| Operation | Admin | User |
|-----------|-------|------|
| Open paid receipt | ✓ | ✓ |
| Record payment | ✓ | ✓ |
| Edit payment (amount + currency) | ✓ | ✓ (gated only at UI level — verify role gate) |
| Void payment | ✓ | ⚠ Verify enforcement — UI may not hide |
| Quick Pay | ✓ | ✓ |

(File any role-leak as a release blocker.)
