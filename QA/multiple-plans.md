# Multiple Plans per Customer (service lines) — QA Scenarios

A customer can subscribe to several plans at once, each a **service line** (`customer_plans`) with its own start/cancel lifecycle, paid independently. Plans are managed inline from the customer form; each line builds its own month grid via the single source of truth `PaymentService.buildMonthGrid(customerPlan, …)`; `payments.customer_plan_id` links a payment to a line, and `UNIQUE(customer_plan_id, billing_month)` lets each line be paid for the same month.

**Reference code:**

- Module: [customer-plans/](../SubsTrack/src/modules/customer-plans/) (repository / service / mapper)
- Slice: [customerPlanSlice.ts](../SubsTrack/src/state/slices/customer-plans/customerPlanSlice.ts) (`syncLines`)
- Plans editor (inline): [CustomerFormSheet.tsx](../SubsTrack/src/modules/customers/components/CustomerFormSheet.tsx)
- Grid host (view-only tabbed selector): [CustomerPaymentPanel.tsx](../SubsTrack/src/modules/customer-payments/components/CustomerPaymentPanel.tsx)
- Aggregation: `buildCustomerStatus` / `getCustomerStatuses` in [PaymentService.ts](../SubsTrack/src/modules/customer/customer-payments/services/PaymentService.ts), `countUnpaidForMonth` in [CustomerRepository.ts](../SubsTrack/src/modules/customer/customers/repository/CustomerRepository.ts)
- Line price resolver (the ONLY answer to "what does this line cost?"): [linePrice.ts](../SubsTrack/src/modules/customer/customer-plans/utils/linePrice.ts)
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
4. **Remove** a line in the form (trash/Remove):
   - A line with **no** payments is hard-deleted silently (no prompt).
   - A line **with** payments opens a **"Remove this plan?"** confirm carrying a **"Delete permanently"** checkbox (unchecked by default). Backing out (Cancel / Back) keeps the plan active.
   - Confirm with the checkbox **unchecked** → line is soft-cancelled only. Its row **stays visible in the form** — dimmed, read-only, with a "Cancelled" badge and a **Reactivate** button — and its months keep their paid state (history intact).
   - Confirm with the checkbox **checked** → the line **and all its payments are permanently deleted** from the database (cascade). The row disappears from the form; the payments are gone from revenue, debts, and the wallet. This cannot be undone (the dialog warns).
   - In both cases the other line keeps working, and future months of the removed line stop being payable (see 3a for the soft-cancelled case — the deleted case has no line left to pay).
5. **Reactivate** a cancelled line in the form:
   - Press **Reactivate** on a cancelled row → it becomes active again; its plan/date fields become editable; on Save the line is active in the DB (`active = true`, `cancelled_at` cleared) with its payment history intact.
   - Soft-cancel a paid line and then Reactivate it **in the same edit session before saving** → the two cancel out, the row is active again with no DB round-trip for that line.
6. The form keeps at least one **active** row — removing the last active one is blocked; clearing a plan makes it a plan-less (custom) line.
7. A cancelled row is **read-only**: its plan dropdown and start-date picker are disabled until you Reactivate it.
8. **Locked start date explains itself on tap.** Pay any month on a line, re-open the customer form → that line's start-date field is greyed. There is **no caption under it** (the reason costs no height). Tap the greyed field → a **"Not available"** popup reads `start_date_locked`, and the date picker does **not** open. An unlocked line's field still opens the picker normally.
9. A **cancelled** row's greyed date field shows **no** popup on tap — the whole row is read-only, so singling out the date would mislead.
10. The month-grid panel selector is **view-only** — it has no add/edit/remove controls.

### 3a. Payments on a cancelled plan

1. Select a cancelled (dimmed) line in the panel. A **past** or **current** month tap opens the payment form and records normally; a **future** month tap shows a "Not available" dialog (`cancelled_plan_future_blocked`).
2. **Quick pay** (cell 3-dot) is offered for a cancelled line's past/current unpaid fixed-price month, and records; it is **not** offered on a future month.
3. **Bulk-select + Pay** on a cancelled line only pays the selected past/current months; future months are dropped from the payable set.
4. The **current month** is still payable on a cancelled line — the gate keys off the calendar month, not the grid status.
5. When the whole customer is inactive, the same past/current-allowed, future-blocked rule applies, but the dialog reads `inactive_future_blocked` (customer-inactive message wins over the cancelled-plan one).

## 4. Aggregated customer-list status

1. Customer with two active lines, both owing nothing → list badge **paid** (green).
2. One line owing nothing, the other unpaid this month → badge **"1/2 plans paid"** (amber); the customer is in the **Partly paid** tab, not Unpaid (a tab holds exactly the customers whose card shows its pill).
3. Any active line with an unpaid past month → the red **"Overdue"** pill, whatever this month's state is. It never appears beside green "✓ Paid" (paid means the customer owes nothing); it *can* appear beside "N/M plans paid" when the customer's other plans are clear.
4. Dashboard `unpaidThisMonth` counts the customer once if any active regular line is uncovered this month.
5. Non-regular customer: lines never counted in unpaid/overdue (gotcha #16); the "N/M plans paid" badge never shows (the "Non-Regular" flag wins).

### 4a. "N/M plans paid" badge (multi-plan)

1. Two active plans, plan A owing nothing + plan B unpaid this month → **"1/2 plans paid"** (amber), NOT red "Unpaid".
2. Three plans, 2 clear + 1 unpaid → **"2/3 plans paid"**.
3. Every plan clear → green "Paid" (badge does not show). No plan clear → red "Unpaid" (badge does not show — needs `0 < paid < total`).
4. Single plan with a partial-amount payment → green **"Paid"** badge (a partial payment counts as paid; the remaining amount shows only on the Debts tab). The "N/M plans paid" badge never fires for a single plan (`total >= 2` required).
5. Pay the last unpaid plan (or "Collect all due") → badge flips to green "Paid" immediately (optimistic, no refetch). Void one plan's month → badge updates to the new count on next focus refresh.
6. The tally counts **all** of a plan's required months, not just this one: the denominator is every plan that has ever had a required month, the numerator is the plans that owe **nothing**. So a plan whose January is unpaid never counts as paid even with this month paid (that customer reads "N/M plans paid" + "Overdue", never "M/M"), while a plan that is skipped or not-yet-due this month but paid up before still counts as paid (a not-required month is treated as non-existent). A plan that has never had a required month counts on neither side.

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

## 7. Offline mirror — paying a second line for a month already paid on another line (regression)

Native only (SQLite mirror). `payments` has two unique keys — `id` and `(customer_plan_id, billing_month)` — and the offline id is derived from that key, so a mirror row whose id and key drift apart used to make the write fail with `UNIQUE constraint failed: payments.id` and permanently block that month on that device (gotcha #49).

1. Two plans on one customer, month X paid on plan A → recording month X on plan B **succeeds** (no `UNIQUE constraint failed: payments.id`), and each line's grid shows its own payment.
2. Record → void → re-record the same month on the same line → updates the **same** row (one payment per line per month, `voided_at` cleared, remittance reset), no duplicate row in Developer → `payments`.
3. Record a month on the web app, then on the phone void it and re-record it offline → the phone updates the row **the server created** (its id is kept, not replaced); voiding/editing that payment straight after works (the returned payment points at a real row).
4. A mirror row left with an empty/foreign `customer_plan_id` (visible in Settings → Developer → `payments`) no longer blocks anything: the new payment is written with a fresh id, the odd row is left untouched.
5. Same line+month existing on the server under a different id than the mirror's copy → the next sync repairs it (the stale local duplicate is dropped) and **the payments pull keeps flowing** — check Developer → `payments` has one row for that line+month and later payments still arrive.

## 8. Per-line special price

A line can carry its own privately negotiated price (`customer_plans.custom_price` + `custom_currency_id`), replacing the plan's — for customers billed by quantity or on a private agreement. Set inline in the customer form's Plans editor on **any plan length**, editable by **any** staff member. It is the price of **one payment**, so on a multi-month plan it covers the whole bundle ("100 per 3 months", never 100 × 3). `resolveLinePrice()` is the single place that decides a line's amount, span and currency; the payment still snapshots `amount_due`, so history never moves.

1. **Set on a fixed single-month line.** Edit customer → the plan row's price is **one collapsed line** reading "Price: 10 USD **per month**" with a **Special price** link → tap it, the amount field opens **immediately** (before anything is typed) with the label "Special price per month", enter `7` USD → Save. The grid header reads **7 USD / month · Special price**; the payment form pre-fills 7 (read-only) with the "special price" caption; quick pay records `amount_due = 7`.
2. **Set on a custom-price / plan-less line.** The collapsed line reads "Amount typed each month" instead of a price. Tap **Special price**, enter `12 USD` → Save → the line becomes **quick-payable** from the month cell, the card menu and "Collect all due" (it previously always opened the manual form), and the header stops reading "Custom".
3. **Clear it.** Tap **Use plan price** (or **Clear** on a plan-less line) → the field collapses back to the one-line summary and the amount is dropped → Save → the plan's price returns everywhere; a plan-less line goes back to routing to the form.
3b. **Re-open shows an existing price expanded.** A line already carrying a special price opens with the amount field **visible** (not collapsed behind the link), so the figure is never hidden.
4. **Non-USD.** Special price `300000 LBP` on a plan priced in USD → the recorded payment stores `currency_id = LBP` **and** LBP's live rate as `rate_per_usd_snapshot` (**not 1**). Then change the LBP rate in Currencies → the recorded receipt's USD value does **not** move (gotcha #21). Check both quick pay and the form.
5. **Multi-month bundle price (the unit is the whole risk).** On a line whose plan is 3 months, the collapsed row reads "Price: 30 USD **per 3 months**"; tap **Special price** and the expanded field's own label reads "Special price **per 3 months**" — the period must be visible exactly where the number is typed. Enter `100` → Save. Then check **every** path charges 100 for the whole block, never 100 per month and never the catalog's 30:
   - grid header → `100 USD / 3mo · Special price`;
   - tap a payable cell → the form's big figure is **100** with "per 3 months" and the special-price caption, and the month chips show the 3 covered months;
   - quick pay from the cell menu → the confirm dialog quotes 100 for the month range, and the written payment has `amount_due = 100`, `duration_months = 3`;
   - grid multi-select over 6 payable months → **two** block payments of 100 each (not six);
   - customer-list "Collect all due" → one payment of 100 covering 3 months.
5b. **Multi-month + non-USD (the rate-snapshot trap).** Special price `9000000 LBP` on a 3-month plan priced in USD → the payment stores `currency_id = LBP` **and** LBP's live rate in `rate_per_usd_snapshot`, **not 1**. A USD rate of 1 here means the amount was taken from the line while the currency was still taken from the plan — that row's value would be wrong by ~89,000× in the dashboard, wallet and debts. Check quick pay, the form, the grid multi-select and "Collect all due" separately.
5c. **Changing the plan changes the meaning, not the number.** A line with special `100` on a 1-month plan → switch its plan to a 3-month one → the amount **survives** (it is the customer's figure) and every label now reads "per 3 months". Save and confirm the next collection charges 100 for 3 months.
6. **Validation.** `0` / negative is refused (`errors.custom_price_positive`); a currency is never stored without an amount (check Settings → Developer → `customer_plans`).
7. **Not frozen by payments.** Pay a month at 7, then change the special price to 9 → the save **succeeds** (unlike the start date, which locks); the paid month's receipt still says 7; the next month collects 9.
8. **Any staff member.** A non-admin `user` can set and change it — no admin gate.
9. **Unsaved-changes prompt** (gotcha #55). Open a customer with a plan-less line and close immediately → **no** discard prompt (the `CurrencyInput` currency self-seed must not count as an edit). Change only the currency of an existing special price and close → prompt **does** appear.
10. **Per line, not per customer.** Two lines, one special one not → each header/grid shows its own amount; "Collect all due" writes one payment per line at its own figure.
11. **Save that changes ONLY the price** (same plan, same start date) → it is actually written (the unchanged-line skip must not swallow it): re-open the customer and confirm the new amount survived.
12. **Audit.** Admin → the customer's History → the change appears as a `customer_plans` update whose "Fields changed" reads **Special price** (plus **Special price currency** when the currency moved), with the before value; a currency renders as `LBP` / `USD`, never a UUID.
13. **Offline.** Airplane mode → set a special price → Developer → `customer_plans` shows `custom_price` with `_dirty = 1` → quick pay offline uses it → reconnect → both the line and the payment push; a second device pulls the price and quick-pays the same figure.
14. **Pay order unaffected.** A line with an older uncovered month is still skipped by "Collect all due" and still blocked in the form (oldest-first) — a special price never widens the pay-order rule.
15. **Bulk skip warning counts LINES.** Select a customer with one special-priced line and one still-typed line → "Collect all due" pays the first and the confirm reports **1** skipped (not 0, which the old per-customer count reported).
16. **Currency deletion.** Give a line a special price in a currency used nowhere else → Currencies → delete that currency → it is **soft-deleted** (marked inactive) with the normal message, never a raw foreign-key error.
