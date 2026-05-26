# Currency × Payments — QA Scenarios

End-to-end coverage of the multi-currency layer as it runs through plans, payment recording, receipt display, editing, aggregation, and the display-currency preference. This file is the authoritative source for all currency/payment intersection scenarios. It cross-references [currencies.md](currencies.md) (currency CRUD) and [payments.md](payments.md) (recording/void/edit mechanics) but does not duplicate them — focus here is the currency decision at each boundary.

**Reference code:**
- Conversion helpers: [currency.ts](SubsTrack/src/core/utils/currency.ts)
- Payment form: [PaymentFormSheet.tsx](SubsTrack/src/modules/customer-payments/components/PaymentFormSheet.tsx)
- Amount-paid section: [PaymentAmountPaidSection.tsx](SubsTrack/src/modules/customer-payments/components/PaymentAmountPaidSection.tsx)
- Receipt: [PaymentDetailSheet.tsx](SubsTrack/src/modules/customer-payments/components/PaymentDetailSheet.tsx)
- Payment service: [PaymentService.ts](SubsTrack/src/modules/customer-payments/services/PaymentService.ts)
- Payment store: [paymentStore.ts](SubsTrack/src/modules/customer-payments/store/paymentStore.ts)
- Plan form: [PlanFormSheet.tsx](SubsTrack/src/modules/plans/components/PlanFormSheet.tsx)
- Plan service: [PlanService.ts](SubsTrack/src/modules/plans/services/PlanService.ts)
- CurrencyInput component: [CurrencyInput.tsx](SubsTrack/src/shared/components/CurrencyInput.tsx)
- Display-currency preference: [uiPrefStore.ts](SubsTrack/src/shared/lib/uiPrefStore.ts)
- Dashboard service: [DashboardService.ts](SubsTrack/src/modules/dashboard/services/DashboardService.ts)
- Customer payment panel: [CustomerPaymentPanel.tsx](SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx)

---

## 0. Critical invariants

These are non-negotiable and must be re-verified after any release touching payments, currencies, or plans.

1. **`currency_id = NULL` means USD everywhere** — USD is never stored as a `currencies` row; null is the sentinel value throughout plans, payments, and the display-currency preference.
2. **Payment amounts are snapshots** — `amount_due`, `amount_paid`, and `rate_per_usd_snapshot` are frozen at record time. Editing a currency's `rate_per_usd` NEVER retroactively changes the USD equivalent of any existing payment.
3. **Plan prices use the live rate** — plan.price is forward-looking; its USD equivalent updates whenever the currency's `rate_per_usd` is edited. No snapshot is stored on the plan row.
4. **`rate_per_usd_snapshot = 1` for USD payments** — USD payments (`currency_id = NULL`) must store exactly `1`, not null or any other value.
5. **Editing a payment re-snapshots** — `PaymentService.updatePayment()` re-reads the live `ratePerUsd` of the (possibly changed) currency and writes a new `rate_per_usd_snapshot`. This is the "correcting the record" semantic.
6. **Amount Paid currency is locked to Amount Due currency** — within one payment, `amount_due` and `amount_paid` are always in the same currency (one `currency_id`).
7. **Soft-deleted currencies are preserved on historical rows** — plans and payments that reference an inactive currency must continue to display correctly. Pickers exclude inactive currencies for new entries only.
8. **Display currency is per-user, AsyncStorage only** — no `display_currency_id` column on the DB `users` table.

---

## 1. Plan pricing and currency setup

The plan's `price + currency_id` defines what is owed at payment time. Plans use the **live** rate for display.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 1.1 | Create plan in USD | PlanFormSheet → leave currency = USD (default) | Plan stored with `currency_id = NULL, price = typed amount`. PlanCard shows `$X.XX / month` |
| 1.2 | Create plan in LBP | Pick LBP, enter `50000` | `currency_id = LBP_id, price = 50000`. PlanCard shows `ل.ل 50,000 / month` with USD equivalent via live rate |
| 1.3 | USD equivalent on PlanCard | LBP plan, rate = 90000, price = 90000 | USD equivalent = `90000 / 90000 = $1.00` shown on card |
| 1.4 | Live rate change updates plan card | Edit LBP.ratePerUsd from 90000 → 100000 | PlanCard USD equivalent recalculates: `90000 / 100000 = $0.90`. No payment rows are touched |
| 1.5 | Plan with EUR | Create plan in EUR at rate 1.08, price 100 | USD equivalent ≈ $92.59 on card |
| 1.6 | Switching currency in plan form | Type `100`, then switch dropdown USD → LBP | Field still shows `100` (now LBP 100). No conversion performed — "I meant this number in the new unit" |
| 1.7 | Multi-month plan in non-USD | Create 3-month plan priced in LBP | `isCustomPrice = false` enforced; price is the bundle amount in LBP. Stored correctly |
| 1.8 | Custom-price plan currency | Create plan with `isCustomPrice = true`, any currency | Currency stored on plan row. At payment time, the form ignores plan price and shows a free CurrencyInput |
| 1.9 | Delete plan currency | Plan priced in LBP; soft-delete LBP | Plan card still shows LBP amount with "(currency inactive)" indicator; no crash |
| 1.10 | Plan currency_id null = USD | Inspect DB row of a USD plan | `currency_id IS NULL` confirmed |

---

## 2. CurrencyInput in payment recording

All payment recording scenarios that involve currency selection go through `CurrencyInput`. This section covers its behavior during payment creation.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 2.1 | Default currency | Open PaymentFormSheet on a fresh session | CurrencyInput defaults to USD (`lastUsedCurrencyId` not yet set) |
| 2.2 | Last-used currency persists | Record a payment in LBP, open the form again | CurrencyInput pre-selects LBP (from `uiPrefStore.lastUsedCurrencyId`) |
| 2.3 | Last-used currency persists across customers | Record LBP for customer A, open form for customer B | Still defaults to LBP |
| 2.4 | Dropdown contents | Open dropdown in CurrencyInput | USD first, then each active tenant currency alphabetically. Inactive currencies absent |
| 2.5 | Tenant with zero custom currencies | Open form on a bare tenant | Dropdown shows USD only |
| 2.6 | Switching currency does NOT convert | Type `100`, switch from USD to LBP | Field still shows `100`. Now interpreted as 100 LBP |
| 2.7 | Switching currency clears partial Amount Paid | Have Amount Paid typed, switch Amount Due currency | Amount Paid field is cleared (old value was in a different unit) |
| 2.8 | Amount Paid currency locked | In PaymentAmountPaidSection (Partial mode) | Amount Paid CurrencyInput dropdown is non-interactive; shows the same currency as Amount Due |
| 2.9 | Locked currency label updates | Switch Amount Due currency while in Partial mode | Amount Paid lock updates to the new currency; Paid field cleared |
| 2.10 | Soft-deleted currency in dropdown | LBP soft-deleted; open CurrencyInput | LBP absent from dropdown options. Existing last-used = LBP → falls back to USD default |
| 2.11 | Rate = very small (exotic currency) | Tenant currency with ratePerUsd = 0.001 | Input and submission work normally; snapshot stored as 0.001 |
| 2.12 | Rate = very large | Tenant currency with ratePerUsd = 1000000 | Works; USD equivalent of a large-denomination amount rounded correctly |
| 2.13 | Decimal-pad keyboard | Tap amount field | Numeric keyboard with decimal separator appears; minus sign blocked |
| 2.14 | Arabic locale number input | Switch app to Arabic, enter amount | Field accepts Arabic-indic numerals if the OS inserts them; parseFloat coerces to float correctly |

---

## 3. Scenario A — Fixed single-month plan, currency inherited from plan

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 3.1 | Amount card displays plan currency | Customer on LBP plan (price = 90000) | Amount card shows `ل.ل 90,000` read-only. No CurrencyInput visible |
| 3.2 | Submit Full — snapshot captured | Tap "Mark as paid" | Payment row: `amount_due = amount_paid = 90000`, `currency_id = LBP_id`, `rate_per_usd_snapshot = LBP.ratePerUsd at submit time` |
| 3.3 | USD plan | Customer on USD plan (price = 50) | Amount card shows `$50.00`. On submit: `currency_id = NULL, rate_per_usd_snapshot = 1` |
| 3.4 | Plan currency changed before recording | Edit plan LBP → USD, then open payment form | Amount card now reflects USD price. The old currency is no longer in play |
| 3.5 | Plan rate changed before recording | LBP rate was 90000 at plan creation; changed to 100000; open form | Amount card still shows the stored LBP `price` value. USD equivalent on PlanCard updated, but the plan `price` column (LBP amount) is unchanged — form shows the LBP amount as-typed |
| 3.6 | Partial payment inherits plan currency | Scenario A, toggle Partial, enter LBP `40000` | `amount_due = 90000, amount_paid = 40000, currency_id = LBP_id`. Snapshot = live LBP rate at submit |
| 3.7 | Partial exceeds due | Enter `amount_paid > 90000` | Submit disabled |

---

## 4. Scenario B — Override on fixed plan (currency changeable in override mode)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 4.1 | Plan-price radio retains plan currency | Tap "Override amount" → stay on Plan price radio | On submit, plan's currency used — same as Scenario A |
| 4.2 | Custom radio shows CurrencyInput | Tap "Custom amount" | CurrencyInput appears; defaults to `lastUsedCurrencyId` (NOT plan currency) |
| 4.3 | Custom in same currency as plan | Plan = LBP; override = LBP 80000 | Payment: `amount_due = 80000, currency_id = LBP_id, snapshot = live LBP rate` |
| 4.4 | Custom in different currency from plan | Plan = LBP; override = USD 50 | Payment: `amount_due = 50, currency_id = NULL, snapshot = 1`. Original plan currency irrelevant after override |
| 4.5 | Switch back to Plan radio after custom | Type custom amount in EUR, switch back to Plan radio | Submit uses plan's LBP price; EUR amount discarded |
| 4.6 | Partial in custom currency | Custom = LBP 80000, toggle Partial, enter 40000 | `amount_paid = 40000, currency_id = LBP_id` |
| 4.7 | Switching currency clears partial | Custom = LBP, type partial 40000, switch to USD | Partial amount cleared |
| 4.8 | lastUsedCurrencyId updated | Submit custom in EUR | Next form open defaults to EUR |

---

## 5. Scenario C — Fully custom (no plan or custom-price plan)

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 5.1 | CurrencyInput visible by default | Open form for customer with no plan | CurrencyInput shown immediately; no plan-price section |
| 5.2 | Submit in USD | Enter `25`, leave currency = USD | `currency_id = NULL, amount_due = amount_paid = 25, snapshot = 1` |
| 5.3 | Submit in LBP | Pick LBP, enter `50000` | `currency_id = LBP_id, amount_due = amount_paid = 50000, snapshot = live LBP rate` |
| 5.4 | Submit in EUR | Pick EUR (if configured), enter `100` | `currency_id = EUR_id, snapshot = live EUR rate` |
| 5.5 | Partial in non-USD | Enter `100000 LBP`, toggle Partial, enter `60000` | `amount_due = 100000, amount_paid = 60000, currency_id = LBP_id` |
| 5.6 | Rate snapshot independence | Submit LBP 50000 at rate 90000. Immediately edit LBP rate to 100000. Open receipt | Receipt still shows `rate_per_usd_snapshot = 90000`; USD equivalent on receipt = `50000 / 90000 ≈ $0.56`, not `$0.50` |
| 5.7 | Quick Pay (Scenario C) preserves lastUsedCurrency | Quick Pay opens form with lastUsedCurrencyId | CurrencyInput defaults to last used, same as regular open |

---

## 6. Scenario D — Multi-month bundle, non-USD currency

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 6.1 | Bundle price in LBP | 3-month plan, price = 270000 LBP | Amount card: `ل.ل 270,000 / 3 months`. Month chips shown |
| 6.2 | Submit Full multi-month LBP | Tap "Mark as paid" | Single payment row: `amount_due = amount_paid = 270000, currency_id = LBP_id, duration_months = 3, snapshot = live LBP rate at submit` |
| 6.3 | Partial multi-month LBP | Toggle Partial, enter `150000 LBP` | `amount_paid = 150000, balance = 120000, currency_id = LBP_id` |
| 6.4 | Multi-month USD bundle | 3-month plan in USD | `currency_id = NULL, snapshot = 1` |
| 6.5 | Quick Pay multi-month LBP | From customer list, menu → Pay Now on 3-month LBP plan | ConfirmDialog: "Pay ل.ل 270,000 covering Jan–Mar 2026? Confirm/Cancel" |
| 6.6 | Conflict detection in non-USD plan | One month of a 3-month LBP bundle already paid | Same conflict flow; currency does not affect conflict logic |
| 6.7 | Multi-month receipt in LBP | Open receipt for a cell in the bundle | Hero amount shows `ل.ل 270,000`; secondary `≈ $X.XX` line via snapshot rate |

---

## 7. Snapshot rate mechanics — the core invariant

All tests in this section verify that `rate_per_usd_snapshot` is frozen at record time and immune to subsequent live-rate edits.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 7.1 | Snapshot captured at submit | LBP rate = 90000, submit LBP payment | `rate_per_usd_snapshot = 90000` in DB row |
| 7.2 | Snapshot not updated by rate edit | Edit LBP.ratePerUsd to 100000 after payment | Old payment's `rate_per_usd_snapshot` remains 90000. Verify via DB inspection |
| 7.3 | Receipt USD equivalent uses snapshot | LBP rate changed to 100000 after a 90000-snapshot payment | Receipt: `ل.ل 50,000 ≈ $0.56` (50000/90000), NOT $0.50 (50000/100000) |
| 7.4 | Year total uses snapshot | CustomerPaymentPanel year total, mixed rates in same year | Each payment divided by its own snapshot; sum in USD accurate regardless of current live rate |
| 7.5 | Dashboard aggregate uses snapshot | Multiple payments across LBP/USD, rate edited mid-month | Dashboard "Collected" = each amount / snapshot summed in USD, then displayed in user's display currency. No drift |
| 7.6 | USD snapshot = 1 always | Submit USD payment (currencyId = null) | `rate_per_usd_snapshot = 1` |
| 7.7 | Snapshot survives plan deletion | Plan deleted after payment recorded | Payment's `rate_per_usd_snapshot` unchanged; receipt displays correctly |
| 7.8 | Snapshot survives currency soft-delete | LBP soft-deleted after payment | Payment's `rate_per_usd_snapshot` unchanged; receipt still shows LBP label + USD equivalent |
| 7.9 | paymentSnapshotCurrency helper | Open receipt for a historical LBP payment | `paymentSnapshotCurrency(payment, currencies)` clones the LBP Currency object with `ratePerUsd` overridden by `rate_per_usd_snapshot` — receipt uses this, not the live rate |
| 7.10 | Plan price uses live rate (contrast) | LBP plan, rate changed | PlanCard USD equivalent updates immediately. This is intentional and distinct from payment snapshots |

---

## 8. Receipt display — stored currency vs. display currency

Receipts show the stored/recorded currency as primary and the user's display currency as a secondary "≈" line.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 8.1 | USD payment, USD display | Payment in USD, display = USD | Hero shows `$50.00`. No secondary line needed (same currency) |
| 8.2 | USD payment, LBP display | Payment in USD, display = LBP | Hero: `$50.00`. Secondary: `≈ ل.ل 4,500,000` (50 × 90000). Uses live LBP rate for display conversion (payment stored in USD, display conversion is just cosmetic) |
| 8.3 | LBP payment, USD display | Payment in LBP at snapshot 90000, display = USD | Hero: `ل.ل 90,000`. Secondary: `≈ $1.00` (90000 / 90000 via snapshot). Rate changes don't shift this |
| 8.4 | LBP payment, EUR display | Payment in LBP at snapshot 90000, display = EUR | Hero: `ل.ل 90,000`. Secondary: `≈ €X.XX` (converts LBP → USD via snapshot, USD → EUR via live EUR rate) |
| 8.5 | EUR payment, LBP display | Payment in EUR at snapshot 1.08, display = LBP | Hero shows EUR amount; secondary shows LBP equivalent |
| 8.6 | Secondary line absent when same | Payment in LBP, display also = LBP | No secondary "≈" line — already in display currency |
| 8.7 | Voided payment display | Open voided payment (if accessible) | Voided payments filtered from year fetch; not reachable via UI receipt entry points |
| 8.8 | Partial receipt currency | Partial LBP payment, display = USD | Hero amber card shows `amount_paid` in LBP; secondary ≈ USD. Balance row also in LBP |
| 8.9 | Multi-month receipt currency | Multi-month LBP bundle | Hero shows bundle total in LBP; secondary ≈ USD. "Covers N months" badge present |

---

## 9. Editing a payment — re-snapshot behavior

Editing a payment writes a new `rate_per_usd_snapshot` from the live rate at edit time, representing "user correcting the record."

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 9.1 | Edit amount, same currency | Edit USD payment, change amount due from 50 → 60 | `rate_per_usd_snapshot` stays 1 (still USD). Receipt recalculates totals |
| 9.2 | Edit currency USD → LBP | Open edit, switch CurrencyInput from USD to LBP, enter new amounts, save | `currency_id = LBP_id, rate_per_usd_snapshot = live LBP rate at edit time` (re-snapshotted) |
| 9.3 | Edit currency LBP → USD | Switch to USD, enter amounts | `currency_id = NULL, rate_per_usd_snapshot = 1` |
| 9.4 | Re-snapshot picks current live rate | LBP rate was 90000 at record time; now = 100000; edit and save without changing currency | `rate_per_usd_snapshot = 100000` (current live rate, not original 90000). USD equivalent of this payment now reflects the corrected record |
| 9.5 | Year total updates after edit | Edit a LBP payment's amount and currency | CustomerPaymentPanel year total recalculates using new amounts and new snapshot |
| 9.6 | Dashboard updates after edit | Edit a payment that contributed to monthly revenue | Dashboard "Collected" reflects the new amounts on next refresh |
| 9.7 | Cancel edit | Open edit mode, change currency, tap Cancel | Original `currency_id` and `rate_per_usd_snapshot` unchanged |
| 9.8 | Amount Paid cleared on currency switch | Edit mode: switch currency | Paid field clears (was in a different unit). Must re-enter |
| 9.9 | Validation after currency switch | Switch to LBP, leave Paid blank, tap Save | Disabled until both Due and Paid filled and Paid ≤ Due |
| 9.10 | Voided payment blocked from edit | Attempt to edit via API: voided payment | Repository `updatePayment` filters `voided_at IS NULL`; no row updated. UI hides Edit button for voided payments |
| 9.11 | Multi-month payment editable amounts | Edit a 3-month LBP bundle | Amount Due and Paid editable (+ currency); `duration_months` not editable. For range correction, void + re-record |

---

## 10. Display currency preference — cross-screen impact

`uiPrefStore.displayCurrencyId` converts all read-only money displays without touching stored data.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 10.1 | Default display = USD | Fresh install, no preference set | All monetary displays in USD |
| 10.2 | Change to LBP | Tenant Settings → Display currency → LBP | Plan cards, dashboard, year totals, compact stats all re-render in LBP |
| 10.3 | PlanCard display conversion | Plan priced in USD at $50; display = LBP at rate 90000 | PlanCard shows `ل.ل 4,500,000 / month` |
| 10.4 | PlanCard display conversion — non-USD plan | Plan priced in LBP 90000; display = USD | PlanCard shows `$1.00 / month` (via live rate) |
| 10.5 | Dashboard "Collected" | Revenue mix of USD + LBP payments; display = LBP | Dashboard sums each payment in USD via snapshot, converts total to LBP via live LBP rate |
| 10.6 | Year total in CustomerPaymentPanel | Multiple LBP + USD payments in a year; display = EUR | Total shown in EUR (USD sum × live EUR rate) |
| 10.7 | Compact admin stats | Admin tab summary cards; display = LBP | All revenue figures in LBP |
| 10.8 | Receipt is immune | Payment in LBP; display = USD | Receipt primary = LBP (stored currency). Secondary ≈ USD. Display preference does NOT override the receipt's primary currency |
| 10.9 | Persistence across restarts | Set display = LBP, kill/reopen app | LBP still selected |
| 10.10 | Logout does not reset | Set display = LBP, logout, re-login | LBP persists (AsyncStorage, not session-bound) |
| 10.11 | Per-user, not per-tenant | Admin A: display = LBP. Admin B: display = USD. Same tenant | Each user sees their own preference |
| 10.12 | Fallback when display currency soft-deleted | User has display = LBP; admin soft-deletes LBP | UI falls back to USD for formatting. No crash |
| 10.13 | Display currency not in DB | Inspect `users` table row | No `display_currency_id` column. Confirms it lives only in AsyncStorage |

---

## 11. Dashboard revenue aggregation across currencies

`DashboardService.getMetrics()` fetches `{amount_paid, rate_per_usd_snapshot}` for each payment of the month and converts to USD via snapshot before summing.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 11.1 | All USD payments | Three USD payments of $10, $20, $30 in current month | Dashboard "Collected" = $60.00 |
| 11.2 | All LBP payments | Three LBP payments at snapshots 90000 each: 90000, 180000, 270000 LBP | USD sum = 1 + 2 + 3 = $6.00. Displayed in user's display currency |
| 11.3 | Mixed currencies | USD $50, LBP 90000 (snapshot 90000 = $1.00) | USD sum = $51.00 |
| 11.4 | Rate changed after payments | LBP rate was 90000 at payment time; now 100000 | Dashboard still shows $1.00 for that LBP payment (snapshot = 90000). Total unaffected by live rate change |
| 11.5 | Voided payments excluded | Void a LBP payment | Dashboard recalculates; voided payment's amount removed from "Collected" |
| 11.6 | Partial payments included | Partial LBP payment: `amount_paid = 45000, snapshot = 90000` | Counts $0.50 (amount_paid / snapshot), not $1.00 (amount_due) |
| 11.7 | Multi-month payments — current month | Customer paid a 3-month LBP bundle covering current month | The single payment row (for the start month) is counted once in the month it was recorded (payment.billing_month). Verify the query window |
| 11.8 | Display currency formatting | USD total = $100.00; display = LBP (rate 90000) | Dashboard shows `ل.ل 9,000,000` |
| 11.9 | Zero payments | No payments recorded for current month | "Collected" = $0 (or equivalent in display currency) |
| 11.10 | Branch-filtered dashboard | Tenant-wide admin switches to Branch A | Dashboard "Collected" includes only payments from Branch A customers |

---

## 12. Year totals in CustomerPaymentPanel

The panel shows per-year totals below the payment grid, aggregated from all non-voided payments in the year.

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 12.1 | Single-currency year | All payments in USD | Year total = sum of `amount_paid` displayed in user's display currency |
| 12.2 | Mixed-currency year | Jan = USD $50, Feb = LBP 90000 (snapshot 90000) | USD sum = $51. Year total = $51 formatted in display currency |
| 12.3 | Rate changed during year | Jan LBP payment at snapshot 90000; Feb LBP at snapshot 100000 (rate edited in between) | Jan contributes `amount/90000`, Feb `amount/100000`. Totals are historically correct |
| 12.4 | Multi-month bundle | Jan entry covers Jan–Mar (duration_months = 3). Navigate to Feb | Feb shows `isGroupSecondary = true`. Year total still counts the single payment row once (not 3 times). Verify |
| 12.5 | Voided payment excluded | Void a payment | Year total decreases by voided `amount_paid` |
| 12.6 | Partial payment in year total | LBP 90000 partial: paid 45000, due 90000 | Year total uses `amount_paid = 45000`, not `amount_due`. Total = 45000/snapshot |
| 12.7 | Year navigation | Navigate to prior year | Year total recalculates from freshly fetched prior-year payments |
| 12.8 | Display currency changed | Change display mid-session | Year total updates to new display currency without re-fetching payments |

---

## 13. Currency interaction with plans during payment recording

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 13.1 | Plan price not recomputed at record | Plan = LBP 90000; rate was 90000 when plan was created; rate now = 100000 | Payment form still shows LBP 90000 (the stored price). `amount_due` = 90000 LBP. This is correct — plan.price is the literal stored number |
| 13.2 | Plan deleted before payment | Customer's plan is deleted; open payment form | Plan reference gone; form falls back to Scenario C (custom). `plan_id` on payment = NULL |
| 13.3 | Plan currency soft-deleted | Plan priced in LBP; LBP soft-deleted; open payment form | Form shows plan price in LBP (inactive currency still displayed on the read-only amount card). New custom payments cannot pick LBP from the dropdown |
| 13.4 | Plan assigned mid-month | Assign a plan to a customer who already has a payment recorded for current month | Existing payment retains its original `currency_id` and `plan_id`. Plan assignment doesn't retroactively change recorded amounts |
| 13.5 | Plan changed between months | Customer on LBP plan pays Jan. Plan changed to USD plan. Opens Feb payment form | Feb form shows USD price (new plan). Jan payment unchanged |

---

## 14. Currency and partial payments — detailed

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 14.1 | Partial in non-USD, receipt amber | LBP partial: due = 90000, paid = 45000 | Receipt hero amber, `balance = 45000`, balance displayed in LBP. Secondary ≈ USD via snapshot |
| 14.2 | Balance row currency | Receipt shows balance | Balance formatted in same currency as `amount_due` and `amount_paid` |
| 14.3 | Orange dot on grid cell | Partial LBP payment | Month cell shows orange dot (partial marker). Color is driven by `balance > 0`, not by currency |
| 14.4 | Edit partial to full | Edit partial LBP payment: raise `amount_paid` to = `amount_due` | Balance → 0; receipt turns green; orange dot removed |
| 14.5 | Edit partial — change currency | Partial USD, edit to LBP | Old USD partial voided? No — edit in-place: new `currency_id = LBP, rate_per_usd_snapshot = live LBP rate`. Both `amount_due` and `amount_paid` re-entered in LBP |
| 14.6 | Partial amount = 0 | Submit with `amount_paid = 0` | Service/UI blocks: amount paid must be > 0 (0 = unpaid slot, not partial) |

---

## 15. Edge cases and failure paths

| # | Scenario | Steps | Expected result |
|---|----------|-------|-----------------|
| 15.1 | Currency with 0 decimals — rounding | LBP (decimals = 0), enter `50000.7` | Stored as `50001`. Receipt shows `50,001 LBP` |
| 15.2 | Currency with 6 decimals | Hypothetical currency, decimals = 6, enter `1.123456789` | Stored rounded to 6 dp: `1.123457` |
| 15.3 | Very large LBP payment | Enter `999999999 LBP` | Saved; formatted with grouping separators in receipt. No integer overflow |
| 15.4 | Rate = 0.000001 | Exotic currency near zero rate | USD equivalent huge; no divide-by-zero (rate > 0 enforced). Formatted without crashing |
| 15.5 | Concurrent payment by two devices, different currencies | Both try to pay same (customer, month) in different currencies | DB unique index blocks second; second device sees friendly error |
| 15.6 | Snapshot when currency just created | Create LBP right before recording a payment | Snapshot = LBP.ratePerUsd at that moment (new rate, not 0 or null). FK for `currency_id` resolves |
| 15.7 | Currency code with max length | Code "ABCDEFGH" (8 chars), create plan in it, record payment | Payment stored with that currency's id; all displays work |
| 15.8 | Symbol with multi-byte characters | Symbol "ل.ل" (Arabic) or "€" | Formatted correctly in all receipt / card displays in both LTR and RTL layouts |
| 15.9 | RTL layout | Switch to Arabic | CurrencyInput dropdown, receipt lines, plan cards all layout RTL. Currency symbols appear on the correct side |
| 15.10 | Tenant B cannot see tenant A currencies | Log into tenant B | Tenant B's CurrencyInput dropdown only shows tenant B's currencies (RLS) |
| 15.11 | Snapshot on multi-month partial | 3-month LBP bundle, partial paid | `rate_per_usd_snapshot` captured once for the single payment row; covers all 3 months. No per-month snapshot |
| 15.12 | Display currency deleted mid-session | Display = LBP; LBP soft-deleted without restarting | App should fall back to USD for display. No crash on next render cycle |
| 15.13 | Offline payment attempt in non-USD | Disable network, submit LBP payment | ErrorBanner inside sheet; no row created. Sheet stays open with typed values and selected currency |
| 15.14 | Double-tap submit | Tap "Mark as paid" twice quickly with LBP currency | `loadingCreate` flag blocks duplicate. Only one payment row created |

---

## 16. Permissions matrix — currency-payments

| Operation | Admin | User |
|-----------|-------|------|
| Choose currency when recording payment | ✓ | ✓ |
| Change display currency preference | ✓ | ✓ |
| Override plan currency (Scenario B) | ✓ | ✓ |
| Edit payment currency | ✓ | ✓ (verify role gate — same as edit payment) |
| View receipt with currency details | ✓ | ✓ |
| Manage tenant currencies (CRUD) | ✓ | ✗ (Admin tab hidden) |
| View CurrencyInput in payment form | ✓ | ✓ |
| View year totals and dashboard in display currency | ✓ | ✓ |

---

## 17. Cross-file references (do not duplicate)

The following areas are covered in detail in sibling files. Refer there for the canonical test plan:

| Topic | File | Section |
|-------|------|---------|
| Currency CRUD, soft/hard delete, USD base card | [currencies.md](currencies.md) | All sections |
| CurrencyInput — last-used, dropdown rendering | [currencies.md](currencies.md) | § 7 |
| Snapshot semantics (short summary) | [payments.md](payments.md) | § 13 |
| Void flow | [payments.md](payments.md) | § 10 |
| Edit payment (general mechanics) | [payments.md](payments.md) | § 9 |
| Multi-month conflict resolution | [payments.md](payments.md) | § 5.5–5.7 |
| Grace period | [payments.md](payments.md) | § 12 |
| Plan CRUD and currency | [plans.md](plans.md) | All sections |
| Dashboard metrics and branch filtering | [dashboard.md](dashboard.md) | All sections |
