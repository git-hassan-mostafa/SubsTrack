# Multiple Plans per Customer (service lines) — QA Scenarios

A customer can subscribe to several plans at once, each a **service line** (`customer_plans`) with its own start/cancel lifecycle, paid independently. Plans are managed inline from the customer form; each line builds its own month grid via the single source of truth `PaymentService.buildMonthGrid(customerPlan, …)`; `payments.customer_plan_id` links a payment to a line, and `UNIQUE(customer_plan_id, billing_month)` lets each line be paid for the same month.

**Reference code:**

- Module: [customer-plans/](../SubsTrack/src/modules/customer-plans/) (repository / service / mapper)
- Slice: [customerPlanSlice.ts](../SubsTrack/src/state/slices/customer-plans/customerPlanSlice.ts) (`syncLines`)
- Plans editor (inline): [CustomerFormSheet.tsx](../SubsTrack/src/modules/customers/components/CustomerFormSheet.tsx)
- Grid host (view-only tabbed selector): [CustomerPaymentPanel.tsx](../SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx)
- Aggregation: `findOverdueCustomerIds` / `findPaymentStatusForMonth` / `computeCurrentMonthStatus` in [PaymentService.ts](../SubsTrack/src/modules/customer-payments/services/PaymentService.ts), `countUnpaidForMonth` in [CustomerRepository.ts](../SubsTrack/src/modules/customers/repository/CustomerRepository.ts)
- Migration: [migration-customer-plans.sql](../sql%20scripts/migration-customer-plans.sql)

---

## 1. Migration / data model

1. Run `migration-customer-plans.sql` on an existing DB → every customer gets exactly one line carrying its old `plan_id` + `start_date` (no `label` column); every payment's `customer_plan_id` is backfilled and NOT NULL; `customers.plan_id` is dropped; `UNIQUE(customer_plan_id, billing_month)` exists.
2. Fresh DB from `script.sql` produces the same final shape (no `customers.plan_id`).

## 2. Single-line customer (no regression)

1. A customer with exactly one active line shows **no line selector** — the detail screen looks identical to the old single-grid view.
2. Per-cell pay, multi-month pay, void, edit, bulk-select all behave as before.
3. Customer card subtitle shows the line's label/plan name; list status badge unchanged.

## 3. Add / manage plans (in the customer form)

1. Edit a customer → the **Plans** section lists one row per active line, each row = plan dropdown + inline start-date picker + delete button on one line. Tap **Add plan**, pick a different plan, set its start date → Save → the detail screen's line selector now shows two tabs; the new line's grid greys months before its start date.
2. Pay the same calendar month on each line independently → two payment rows, both visible (previously blocked by the old unique constraint).
3. Edit a line's plan and/or its start date inline in the form → Save → grid + card summary update; changing the start date moves that line's before_start boundary.
4. **Remove** a line in the form (trash/Remove): a line with **no** payments is hard-deleted; a line **with** payments is soft-cancelled — it shows dimmed in the panel selector (history viewable), its future months stop being payable, the other line keeps working.
5. The form keeps at least one row — removing the last is blocked; clearing its plan makes it a plan-less (custom) line.
6. The month-grid panel selector is **view-only** — it has no add/edit/remove controls.

## 4. Aggregated customer-list status

1. Customer with two active lines, both current month paid → list badge **paid** (green).
2. One line paid, the other unpaid (past grace) → badge **"1/2 plans paid"** (amber); customer still appears in the Unpaid tab.
3. Any active line with an unpaid past month → customer is **overdue** (red) even if the current month is paid — **unless** the current month is a mixed pay (some plans paid), in which case the "N/M plans paid" badge wins over the red.
4. Dashboard `unpaidThisMonth` counts the customer once if any active regular line is uncovered this month.
5. Non-regular customer: lines never counted in unpaid/overdue (gotcha #16); the "N/M plans paid" badge never shows (the "Non-Regular" flag wins).

### 4a. "N/M plans paid" badge (multi-plan)

1. Two active plans, plan A paid + plan B unpaid this month → **"1/2 plans paid"** (amber), NOT red "Unpaid".
2. Three plans, 2 paid + 1 unpaid → **"2/3 plans paid"**.
3. All plans paid this month → green "Paid" (badge does not show). None paid → red "Unpaid" (badge does not show — needs `0 < paid < total`).
4. Single plan with a partial-amount payment → green **"Paid"** badge (a partial payment counts as paid; the remaining amount shows only on the Debts tab). The "N/M plans paid" badge never fires for a single plan (`total >= 2` required).
5. Pay the last unpaid plan (or "Collect all due") → badge flips to green "Paid" immediately (optimistic, no refetch). Void one plan's month → badge updates to the new count on next focus refresh.
6. A plan whose current month is still within the grace window counts toward the denominator but not the numerator (e.g. one paid + one in-grace-unpaid → "1/2 plans paid").

## 4b. Card 3-dot menu labels (customer list)

Labels depend on how many plans the customer has **in play this month** (active lines already started): 1 = single-plan wording, 2+ = plan-aware wording.

1. **Single-plan** customer: quick-pay row reads **"Quick pay"** and the void row reads **"Void current month"**; the void confirm is the plain **"Void Payment?"** / "…will mark {{month}} {{year}} as unpaid…".
2. **Multi-plan** customer: quick-pay row reads **"Quick pay unpaid plans"** and the void row reads **"Void paid plans"**; the void confirm title is **"Void paid plans?"** and the message states it marks the month unpaid **for every plan paid this month** and that a **multi-month bundle is voided in full**.
3. Quick-pay row shows whenever the customer has **≥1 started plan still unpaid** this month — including the **mixed** case (some plans paid, some not). It pays **only the still-unpaid fixed-price plans**; already-paid/partial plans are never re-paid (no upsert-overwrite).
4. Void row shows whenever the customer has **≥1 paid/partial plan** this month. On a multi-plan customer with several plans paid → voids **all** their current-month payments at once.
5. Customer who paid a multi-month bundle covering this month → voiding removes the **whole** bundle (all its months), not just the current month; the multi-plan confirm warns about this.
6. A **mixed** multi-plan customer shows **both** rows at once — "Quick pay unpaid plans" (for the remaining unpaid plans) **and** "Void paid plans" (for the already-paid ones).
7. After voiding, the covered-line set + overdue/paid badges refresh so quick pay re-appears for the freed plans.

## 5. Collect all due (Quick Pay)

1. Card/menu Quick Pay on a customer with several eligible fixed-price lines → one tap records the current month for **all** of them (single confirm; multi-month lines flagged).
2. Bulk Quick Pay across selected customers → one batch covering every eligible fixed-price line; custom-price / plan-less customers are skipped (flagged in the confirm) and can be paid via the detail form.
3. After paying, badges refresh; quick pay hides for now-covered customers.

## 6. Custom / occasional

1. A plan-less line (or custom-price plan) records ad-hoc amounts via the manual form (Scenario C), exactly as before.
2. Transactions → Payments rows show the plan name so a customer's multiple lines are distinguishable; voiding + re-paying reuses the per-line row.
