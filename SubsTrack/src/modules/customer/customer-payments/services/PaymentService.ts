import type {
  Customer,
  CustomerMonthStatus,
  CustomerPlan,
  CustomerStatus,
  MonthEntry,
  MonthStatus,
  Payment,
  Plan,
  SkippedMonth,
  TierPlan,
  UnpaidStartRule,
} from "@/src/core/types";
import { MONTHS, type BranchFilter } from "@/src/core/constants";
import { getCurrentYearMonth, toBillingMonth } from "@/src/core/utils/date";
import {
  isBeforeStartDate,
  isNotDueYet,
  isNotLateYet,
} from "../utils/monthDueRules";
import { DEFAULT_UNPAID_START_RULE } from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import i18n from "@/src/core/i18n";
import repository from "../repository/PaymentRepository";
import skippedMonthService from "./SkippedMonthService";
import { tierService } from "@/src/modules/admin/subscription";
import { mapDbPaymentToPayment, mapDbPaymentRowToListItem } from "../utils/mapper";
import {
  billingMonthLabel,
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
} from "../utils/payOrder";
import { CreateMultiMonthPaymentResult, FindPaymentsOptions, MultiMonthConflict, PaymentListItem } from "../utils/types";

type CreatePaymentInput = Pick<Payment, 'billingMonth' | 'amountDue' | 'amountPaid' | 'durationMonths' | 'currencyId' | 'ratePerUsdSnapshot' | 'customerId' | 'customerPlanId' | 'planId' | 'receivedByUserId' | 'tenantId' | 'notes'>

// One entry in a customer-list bulk quick pay: a single fixed-price service line
// paid for `billingMonth` with its plan + frozen rate. Multi-month plans become
// a block payment covering plan.durationMonths from billingMonth. A customer with
// several lines contributes one entry per eligible line ("collect all due").
interface BulkPayCustomerInput {
  customerId: string;
  // The whole service line, not just its id — the pay-oldest-first guard needs
  // its start date to know how far back the line can owe.
  line: CustomerPlan;
  plan: Plan;
  billingMonth: string;
  amountPaid: number;
  ratePerUsdSnapshot: number;
}

class PaymentService {
  // Returns every non-voided payment for a customer (all years). The panel
  // loads this once and rebuilds each year's grid client-side.
  async getPaymentsForCustomer(customerId: string): Promise<Payment[]> {
    const rows = await repository.findByCustomer(customerId);
    return rows.map(mapDbPaymentToPayment);
  }

  // Tenant-wide, paginated, filterable payment list for the Transactions → Payments
  // tab. Each item carries its customer name for display.
  async getPayments(opts: FindPaymentsOptions = {}): Promise<PaymentListItem[]> {
    const rows = await repository.findAll(opts);
    return rows.map(mapDbPaymentRowToListItem);
  }

  // Buckets monthlyTotals() rows into per-calendar-month USD sums ("YYYY-MM"
  // keys, by paid_at) — the authoritative total for a Payments tab section
  // header, independent of how many of that month's rows are paginated in.
  async getMonthlyTotals(opts: FindPaymentsOptions = {}): Promise<Record<string, number>> {
    // A total is money actually collected, so voided rows never count — even
    // when the LIST asks for them (history shows the reversal, the sum doesn't).
    const rows = await repository.monthlyTotals({ ...opts, includeVoided: false });
    const totals: Record<string, number> = {};
    for (const r of rows) {
      const d = new Date(r.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      totals[key] = (totals[key] ?? 0) + r.amount / r.ratePerUsdSnapshot;
    }
    return totals;
  }

  // Non-voided payments that still owe money (partial payments) — the "Months"
  // debt category. Each item carries its customer + plan name for display.
  async getPartialPayments(branchFilter: BranchFilter = null): Promise<PaymentListItem[]> {
    const rows = await repository.partialPayments(branchFilter);
    return rows.map(mapDbPaymentRowToListItem);
  }

  // Collector wallet: non-voided, still-in-wallet (unremitted) payments with cash
  // collected. Each item carries its customer + plan name. Optionally scoped to
  // one collector (received_by_user_id).
  async getUnremittedForWallet(
    branchFilter: BranchFilter = null,
    collectorUserId: string | null = null,
  ): Promise<PaymentListItem[]> {
    const rows = await repository.unremittedForWallet(branchFilter, collectorUserId);
    return rows.map(mapDbPaymentRowToListItem);
  }

  // Mark payments as handed over (remitted) by an admin — removes them from the
  // collector's wallet.
  async markRemitted(ids: string[], remittedBy: string): Promise<void> {
    await repository.markRemitted(ids, remittedBy);
  }

  async createPayment(data: CreatePaymentInput): Promise<Payment> {
    validateCreatePayment(data);
    const row = await repository.create(toPaymentPayload(data));
    return mapDbPaymentToPayment(row);
  }

  // Creates several single-month payments in one round-trip. Used by the
  // month-grid bulk pay (fixed and custom-price). Every input is validated
  // before any write so a bad row fails the whole batch up front.
  async createPayments(inputs: CreatePaymentInput[]): Promise<Payment[]> {
    if (inputs.length === 0) return [];
    inputs.forEach(validateCreatePayment);
    const rows = await repository.createMany(inputs.map(toPaymentPayload));
    return rows.map(mapDbPaymentToPayment);
  }

  // Pays one billing month for many DIFFERENT customers in a single round-trip
  // — each at its own plan price/currency. Multi-month plans create one block
  // payment covering plan.durationMonths from billingMonth. Used by the
  // customer-list bulk quick pay. All-or-nothing: an invalid row, or a tier that
  // forbids multi-month, fails the whole batch (callers gate eligibility first).
  async bulkPayCustomers(
    inputs: BulkPayCustomerInput[],
    receivedByUserId: string,
    tenantId: string,
    tier: TierPlan,
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Promise<Payment[]> {
    if (inputs.length === 0) return [];
    if (inputs.some((i) => i.plan.durationMonths > 1)) {
      tierService.assertMultiMonth(tier);
    }
    const paymentInputs: CreatePaymentInput[] = inputs.map((i) => {
      if (i.plan.price === null) {
        throw new Error(i18n.t('errors.plan_fixed_for_multimonth'));
      }
      return {
        billingMonth: i.billingMonth,
        amountDue: i.plan.price,
        amountPaid: i.amountPaid,
        durationMonths: i.plan.durationMonths,
        currencyId: i.plan.currencyId,
        ratePerUsdSnapshot: i.ratePerUsdSnapshot,
        customerId: i.customerId,
        customerPlanId: i.line.id,
        planId: i.plan.id,
        receivedByUserId,
        tenantId,
        notes: null,
      };
    });
    paymentInputs.forEach(validateCreatePayment);
    await this.assertBulkPayableInOrder(inputs, unpaidRule);
    const rows = await repository.createMany(paymentInputs.map(toPaymentPayload));
    return rows.map(mapDbPaymentToPayment);
  }

  // The pay-oldest-first guard for "collect all due", which spans MANY customers
  // the caller holds no payments for. Two tenant-wide reads (the same pair
  // getCustomerStatuses uses) instead of one round-trip per line, so the cost
  // doesn't grow with the batch. The list's UI already hides lines with an
  // uncovered earlier month — this is the layer that makes it a rule, not a filter.
  private async assertBulkPayableInOrder(
    inputs: BulkPayCustomerInput[],
    unpaidRule: UnpaidStartRule,
  ): Promise<void> {
    const [rows, skips] = await Promise.all([
      repository.findActivePayments(),
      skippedMonthService.getActiveSkips(),
    ]);
    const payments = rows.map(mapDbPaymentToPayment);
    for (const i of inputs) {
      this.assertPayableInOrder(
        i.line,
        coveredBillingMonths(i.billingMonth, i.plan.durationMonths),
        payments.filter((p) => p.customerPlanId === i.line.id),
        skips.filter((s) => s.customerPlanId === i.line.id),
        unpaidRule,
      );
    }
  }

  // Creates a multi-month payment starting at startMonth covering durationMonths months.
  // amountPaid: what was actually collected (may be less than plan.price for partial payments).
  // existingPayments: the current payments for this customer (to detect conflicts).
  // lineSkips: the line's active skips — a block covering one is refused whole.
  // skipConflicts: if true, steps over already-paid months; if false, throws on conflict.
  async createMultiMonthPayment(
    startMonth: string,
    customer: Customer,
    customerPlanId: string,
    plan: Plan,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    existingPayments: Payment[],
    lineSkips: SkippedMonth[],
    skipConflicts: boolean,
    ratePerUsdSnapshot: number,
    tier: TierPlan,
  ): Promise<CreateMultiMonthPaymentResult> {
    tierService.assertMultiMonth(tier);
    if (!startMonth.endsWith("-01")) {
      throw new Error(i18n.t("errors.billing_month_format"));
    }
    if (!plan.price || plan.price <= 0) {
      throw new Error(i18n.t("errors.plan_fixed_for_multimonth"));
    }
    if (amountPaid > plan.price) {
      throw new Error(i18n.t("errors.amount_paid_exceeds_due"));
    }
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t("errors.rate_snapshot_positive"));
    }

    const coveredByExisting = buildCoverageSet(existingPayments);
    const { effectiveStart, effectiveDuration, conflictMonths } =
      resolveMultiMonthBlock(startMonth, plan, coveredByExisting);

    if (!skipConflicts && conflictMonths.length > 0) {
      throw new Error(
        i18n.t("errors.months_already_paid", { months: conflictMonths.map((m) => m.label).join(", ") }),
      );
    }
    // If all months are covered, nothing to create.
    if (effectiveDuration <= 0) {
      throw new Error(i18n.t("errors.all_months_paid"));
    }
    assertNoSkippedMonths(effectiveStart, effectiveDuration, lineSkips);

    const row = await repository.create({
      billing_month: effectiveStart,
      amount_due: plan.price,
      amount_paid: amountPaid,
      duration_months: effectiveDuration,
      currency_id: plan.currencyId,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      customer_id: customer.id,
      customer_plan_id: customerPlanId,
      plan_id: plan.id,
      received_by_user_id: receivedByUserId,
      tenant_id: tenantId,
      notes,
    });

    return { payment: mapDbPaymentToPayment(row), conflictMonths };
  }

  // Creates one multi-month block payment per start month in a single
  // round-trip. The starts come from the grid's start-aligned windows and are
  // non-overlapping, so each block is resolved against the same pre-existing
  // coverage; fully-covered blocks are dropped and surfaced via conflictMonths.
  async createMultiMonthPayments(
    starts: string[],
    customer: Customer,
    customerPlanId: string,
    plan: Plan,
    amountPaid: number,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    existingPayments: Payment[],
    lineSkips: SkippedMonth[],
    ratePerUsdSnapshot: number,
    tier: TierPlan,
  ): Promise<{ payments: Payment[]; conflictMonths: MultiMonthConflict[] }> {
    tierService.assertMultiMonth(tier);
    if (!plan.price || plan.price <= 0) {
      throw new Error(i18n.t("errors.plan_fixed_for_multimonth"));
    }
    if (amountPaid > plan.price) {
      throw new Error(i18n.t("errors.amount_paid_exceeds_due"));
    }
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t("errors.rate_snapshot_positive"));
    }

    const covered = buildCoverageSet(existingPayments);
    const payloads = [];
    const conflictMonths: MultiMonthConflict[] = [];
    for (const startMonth of starts) {
      if (!startMonth.endsWith("-01")) {
        throw new Error(i18n.t("errors.billing_month_format"));
      }
      const resolved = resolveMultiMonthBlock(startMonth, plan, covered);
      conflictMonths.push(...resolved.conflictMonths);
      if (resolved.effectiveDuration <= 0) continue; // whole block already covered
      assertNoSkippedMonths(resolved.effectiveStart, resolved.effectiveDuration, lineSkips);
      payloads.push({
        billing_month: resolved.effectiveStart,
        amount_due: plan.price,
        amount_paid: amountPaid,
        duration_months: resolved.effectiveDuration,
        currency_id: plan.currencyId,
        rate_per_usd_snapshot: ratePerUsdSnapshot,
        customer_id: customer.id,
        customer_plan_id: customerPlanId,
        plan_id: plan.id,
        received_by_user_id: receivedByUserId,
        tenant_id: tenantId,
        notes,
      });
    }
    if (payloads.length === 0) {
      throw new Error(i18n.t("errors.all_months_paid"));
    }
    const rows = await repository.createMany(payloads);
    return { payments: rows.map(mapDbPaymentToPayment), conflictMonths };
  }

  // Updates an existing (non-voided) payment's amount_paid in place. Amount
  // due (and its currency/rate snapshot) is frozen once a payment is recorded —
  // callers pass the existing Payment so due/currency/rate are always echoed
  // back unchanged, never re-derived from caller input. Voided payments stay
  // locked via the repository's voided_at IS NULL filter.
  async updatePayment(payment: Payment, amountPaid: number): Promise<Payment> {
    if (amountPaid < 0) throw new Error(i18n.t("errors.amount_paid_negative"));
    if (amountPaid > payment.amountDue) {
      throw new Error(i18n.t("errors.amount_paid_exceeds_due"));
    }
    // Editing to 0 would un-pay the month (buildMonthGrid needs amountPaid > 0),
    // a back door around the void guard: it could leave a paid month sitting on
    // an unpaid one, and it keeps no void reason. Void the payment instead.
    if (amountPaid === 0) {
      throw new Error(i18n.t("errors.edit_amount_zero"));
    }
    const row = await repository.updatePayment(payment.id, {
      amountDue: payment.amountDue,
      amountPaid,
      currencyId: payment.currencyId,
      ratePerUsdSnapshot: payment.ratePerUsdSnapshot,
    });
    return mapDbPaymentToPayment(row);
  }

  async voidPayment(
    id: string,
    voidedBy: string,
    notes: string,
  ): Promise<Payment> {
    await this.assertVoidableInOrder([id]);
    // Reason is optional — store the trimmed note, or null when left blank.
    const trimmed = notes.trim();
    const row = await repository.voidPayment(id, voidedBy, trimmed || null);
    return mapDbPaymentToPayment(row);
  }

  // Customer-list quick void: voids EVERY active payment whose block covers the
  // CURRENT month across all of a customer's lines (fetches on demand — the list
  // doesn't keep per-customer payments). Multi-month blocks are voided whole,
  // matching the detail-sheet void. Returns the voided payments (empty when none
  // cover the current month).
  async voidCurrentMonth(
    customerId: string,
    voidedBy: string,
    notes: string,
  ): Promise<Payment[]> {
    const { year, month } = getCurrentYearMonth();
    const currentBillingMonth = toBillingMonth(year, month);
    const payments = await this.getPaymentsForCustomer(customerId);
    const covering = payments.filter((p) => {
      if (p.amountPaid <= 0) return false;
      const [pYear, pMonthNum] = p.billingMonth.split("-").map(Number);
      for (let d = 0; d < p.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        if (
          toBillingMonth(date.getFullYear(), date.getMonth() + 1) ===
          currentBillingMonth
        ) {
          return true;
        }
      }
      return false;
    });
    if (covering.length === 0) return [];
    return this.voidPayments(covering.map((p) => p.id), voidedBy, notes);
  }

  // Voids several payments in one round-trip (month-grid bulk void).
  async voidPayments(
    ids: string[],
    voidedBy: string,
    notes: string,
  ): Promise<Payment[]> {
    if (ids.length === 0) return [];
    await this.assertVoidableInOrder(ids);
    const trimmed = notes.trim();
    const rows = await repository.voidMany(ids, voidedBy, trimmed || null);
    return rows.map(mapDbPaymentToPayment);
  }

  // Voids run NEWEST FIRST: a month may not be voided while a LATER month of the
  // same service line is still paid. Without it, undoing an old month leaves a
  // paid month on top of an unpaid one — exactly the state the pay-oldest-first
  // rule exists to prevent, reached from the other side.
  //
  // Resolves the rows itself from the ids, so EVERY caller is covered — the
  // Transactions → Payments tab voids a mixed selection and never loads a grid.
  // Months inside the same void never block each other.
  private async assertVoidableInOrder(ids: string[]): Promise<void> {
    const targets = (await repository.findByIds(ids)).map(mapDbPaymentToPayment);
    // Nothing to protect once a target is already voided (a repeat void is a
    // no-op at the repository), and a zero-paid slot was never a payment.
    const live = targets.filter((p) => p.voidedAt === null && p.amountPaid > 0);
    if (live.length === 0) return;

    // One read per customer, then the rule is applied per service line.
    const byCustomer = groupBy(live, (p) => p.customerId);
    for (const [customerId, customerTargets] of byCustomer) {
      const active = await this.getPaymentsForCustomer(customerId);
      for (const [lineId, lineTargets] of groupBy(customerTargets, (p) => p.customerPlanId)) {
        const paidMonths = this.paidBillingMonths(
          active.filter((p) => p.customerPlanId === lineId),
        );
        const targetMonths = lineTargets.flatMap((p) =>
          coveredBillingMonths(p.billingMonth, p.durationMonths),
        );
        const blocking = blockingPaidMonths(paidMonths, targetMonths);
        // Only the newest is named — that is the one month to void next.
        if (blocking.length > 0) {
          throw new Error(
            i18n.t("errors.later_month_paid", { month: billingMonthLabel(blocking[0]) }),
          );
        }
      }
    }
  }

  // Builds the complete customer-list status for ONE customer, straight from
  // buildMonthGrid (rule #1) — this is the only place the list's badge data is
  // decided. `payments` / `skips` must be that customer's FULL history (all
  // lines, all years), because every count below looks back to each line's start.
  //
  // A line counts as paid only when it owes NOTHING up to its last required
  // month, so "paid" can never sit next to "overdue" — the two are mutually
  // exclusive by construction, not by display rules (gotcha #56). Only a month
  // that resolved to "paid" or "unpaid" was ever required: before_start, future
  // (incl. a current month the billing-day rule holds back) and skipped all mean
  // "nothing expected", so they are treated as if they did not exist.
  //
  // One walk yields TWO different "behind" facts, and they are not the same set:
  // `overdue` = an earlier month is LATE, while `uncoveredLineIds` = an earlier
  // month has nothing collected. Under 'customer_start_day' last month can be the
  // second without being the first — red, blocking, not yet overdue (#83).
  buildCustomerStatus(
    lines: CustomerPlan[],
    payments: Payment[],
    skips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): CustomerStatus {
    const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
    const notDueLineIds: string[] = [];
    const uncoveredLineIds: string[] = [];
    let overdue = false;
    let anySkipped = false;
    let dueThisMonth = 0; // lines that owe THIS month — decides the "nothing owed" reason
    let inPlay = 0;       // lines that have ever had a required month
    let settled = 0;      // ...of those, the ones owing nothing at all

    for (const line of lines) {
      if (!line.active) continue;
      const linePayments = payments.filter((p) => p.customerPlanId === line.id);
      const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
      const startYear = new Date(line.startDate).getFullYear();

      let current: MonthEntry | null = null;
      let lineOverdue = false;
      let lineUncovered = false;
      let lineRequired = 0;
      let lineUnpaid = 0;
      for (let year = startYear; year <= currentYear; year++) {
        for (const entry of this.buildMonthGrid(line, linePayments, lineSkips, year, unpaidRule)) {
          if (entry.status === "paid" || entry.status === "unpaid") {
            // A partial payment resolves to "paid" (its balance becomes a debt),
            // so a covered month always counts as settled here.
            lineRequired++;
            if (entry.status === "unpaid") lineUnpaid++;
          }
          // This month is kept for the quick-pay decision below; it and the
          // calendar months after it are never "behind".
          if (entry.year === currentYear && entry.month >= currentMonth) {
            if (entry.month === currentMonth) current = entry;
            continue;
          }
          // Only a month strictly BEFORE this one can leave the line behind.
          if (entry.status !== "unpaid") continue;
          // Nothing was collected, so oldest-first bars THIS month from being
          // quick-paid — whether or not the customer reads as overdue yet.
          lineUncovered = true;
          // Last month is not LATE until this month's billing day passes
          // ('customer_start_day', #83). It stays red and still blocks; only the
          // "Overdue" flag waits. Older months are late on sight.
          if (!isNotLateYet(unpaidRule, entry.year, entry.month, line.startDate)) {
            lineOverdue = true;
          }
        }
      }
      if (lineOverdue) overdue = true;
      if (lineUncovered) uncoveredLineIds.push(line.id);
      if (lineRequired > 0) {
        inPlay++;
        if (lineUnpaid === 0) settled++;
      }

      // Quick pay collects THIS month, so what it must skip is decided by the
      // current entry alone. "before_start" (the line starts later) and a
      // missing entry both mean the line is not in play this month.
      if (!current || current.status === "before_start") continue;
      if (current.status === "skipped") {
        anySkipped = true;
        notDueLineIds.push(line.id);
        continue;
      }
      // "future" here can only be the 'customer_start_day' rule holding the
      // CURRENT month back — nothing owed yet. It stays quick-payable (pay
      // early is allowed), so it is NOT added to notDueLineIds; a hole behind it
      // is what uncoveredLineIds catches.
      if (current.status === "future") continue;

      dueThisMonth++;
      if (current.status === "paid") notDueLineIds.push(line.id);
    }

    // settled === inPlay → the customer owes nothing at all (inPlay === 0
    // included: no line has ever been required). When no line owes THIS month
    // either, the reason is what's worth showing: a deliberate skip, or a
    // start date / billing day not reached yet. Never fall back to "unpaid" —
    // an absent fact is not a debt.
    const status: CustomerMonthStatus =
      settled === inPlay
        ? dueThisMonth === 0
          ? anySkipped
            ? "skipped"
            : "not_due_yet"
          : "paid"
        : settled > 0
          ? "mixed"
          : "unpaid";

    return {
      status,
      overdue,
      planCount: { paid: settled, total: inPlay },
      notDueLineIds,
      uncoveredLineIds,
    };
  }

  // The customer list's whole badge dataset, in ONE query pass: every payment
  // and skip is fetched once, grouped per customer, then run through
  // buildCustomerStatus. Customers absent from the returned map have no status
  // yet — the list must render no payment badge for them rather than guessing.
  async getCustomerStatuses(
    customers: Customer[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Promise<Map<string, CustomerStatus>> {
    const [rows, skips] = await Promise.all([
      repository.findActivePayments(),
      skippedMonthService.getActiveSkips(),
    ]);
    const paymentsByCustomer = groupBy(rows.map(mapDbPaymentToPayment), (p) => p.customerId);
    const skipsByCustomer = groupBy(skips, (s) => s.customerId);

    const statuses = new Map<string, CustomerStatus>();
    for (const customer of customers) {
      // Inactive and occasional (non-regular) customers show their own flag
      // instead of a payment one, and quick pay skips them — so there is
      // nothing to compute.
      if (!customer.active || !customer.isRegular) continue;
      statuses.set(
        customer.id,
        this.buildCustomerStatus(
          customer.customerPlans ?? [],
          paymentsByCustomer.get(customer.id) ?? [],
          skipsByCustomer.get(customer.id) ?? [],
          unpaidRule,
        ),
      );
    }
    return statuses;
  }

  // Every month this service line still owes, oldest first, across ALL years
  // from its start to today. Derived from buildMonthGrid (rule #1) because an
  // unpaid month can sit in a year the caller isn't looking at — the panel only
  // holds the viewed year's grid.
  //
  // OVERDUE months only. For the pay-in-order gate use uncoveredBillingMonths,
  // which also counts not-yet-due gaps (see #81b).
  unpaidBillingMonths(
    line: CustomerPlan,
    linePayments: Payment[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): string[] {
    const { year: currentYear } = getCurrentYearMonth();
    const months: string[] = [];
    for (let year = new Date(line.startDate).getFullYear(); year <= currentYear; year++) {
      for (const entry of this.buildMonthGrid(line, linePayments, lineSkips, year, unpaidRule)) {
        if (entry.status === "unpaid") months.push(entry.billingMonth);
      }
    }
    return months;
  }

  // Every month this line has NOT covered, oldest first — "unpaid" plus the
  // not-yet-due months a prepay would jump over. This is what the pay-in-order
  // gate compares against: paying ahead is allowed, paying ahead out of ORDER is
  // not, so paying December while September–November sit empty is refused even
  // though none of those three is overdue yet (#81b).
  //
  // The walk runs past the current year up to the line's latest covered month,
  // because a gap is only a gap when something later is paid — that is exactly
  // the row a prepay leaves behind.
  uncoveredBillingMonths(
    line: CustomerPlan,
    linePayments: Payment[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): string[] {
    const { year: currentYear } = getCurrentYearMonth();
    const covered = this.paidBillingMonths(linePayments);
    // Nothing is covered beyond today → no prepay to leave a hole behind, so the
    // overdue walk already says everything there is to say.
    const lastCovered = covered.length > 0 ? covered[covered.length - 1] : null;
    const endYear = Math.max(
      currentYear,
      lastCovered ? Number(lastCovered.slice(0, 4)) : currentYear,
    );

    const months: string[] = [];
    for (let year = new Date(line.startDate).getFullYear(); year <= endYear; year++) {
      for (const entry of this.buildMonthGrid(line, linePayments, lineSkips, year, unpaidRule)) {
        // "future" joins "unpaid" here — both mean nothing has been collected.
        // before_start (line hadn't started) and skipped (nothing expected) are
        // not holes, and paid needs nothing.
        if (entry.status === "unpaid" || entry.status === "future") {
          months.push(entry.billingMonth);
        }
      }
    }
    return months;
  }

  // Every month this service line currently has PAID, across all years — a
  // multi-month block counted month by month. Straight from the payments (not the
  // grid), so it is not year-scoped: the void-newest-first gate must see a paid
  // month sitting in a year the caller isn't looking at.
  paidBillingMonths(linePayments: Payment[]): string[] {
    return [...buildCoverageSet(linePayments)].sort();
  }

  // Months are settled OLDEST FIRST: a write is refused while an earlier month
  // of the same line is still uncovered — overdue OR merely not due yet, so a
  // prepay can't leave a hole behind it. The guard every pay path runs before it
  // writes; `targetMonths` is every month the write would cover, so paying a
  // backlog (or a run of future months) in one batch is allowed.
  assertPayableInOrder(
    line: CustomerPlan,
    targetMonths: string[],
    linePayments: Payment[],
    lineSkips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): void {
    const blocking = blockingUnpaidMonths(
      // Uncovered, not merely overdue — a prepay must not jump a not-yet-due month.
      this.uncoveredBillingMonths(line, linePayments, lineSkips, unpaidRule),
      targetMonths,
    );
    // Only the oldest is named — that is the one month the user must collect next.
    if (blocking.length > 0) {
      throw new Error(
        i18n.t("errors.earlier_month_unpaid", { month: billingMonthLabel(blocking[0]) }),
      );
    }
  }

  // THE single source of truth for month status logic. No other file may reimplement this.
  // Builds the grid for ONE service line: `payments` and `skips` must already be
  // scoped to that line, and `line.startDate` sets the before_start boundary. (A
  // customer with several lines builds one grid per line — see paymentSlice.buildGrids.)
  // `unpaidRule` is the tenant's UnpaidStartRule; it only ever affects the CURRENT
  // month (see the status ladder below).
  buildMonthGrid(
    line: CustomerPlan,
    payments: Payment[],
    skips: SkippedMonth[],
    year: number,
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): MonthEntry[] {
    const { year: cy, month: cm } = getCurrentYearMonth();

    const skipByMonth = new Map<string, SkippedMonth>();
    for (const skip of skips) {
      if (skip.skipped) skipByMonth.set(skip.billingMonth, skip);
    }

    // Build coverage map: billingMonth → { payment, isSecondary }
    // Multi-month payments cover consecutive months; each covered month points back to the payment.
    const coverageMap = new Map<string, { payment: Payment; isGroupSecondary: boolean }>();
    for (const payment of payments) {
      const [pYear, pMonthNum] = payment.billingMonth.split("-").map(Number);
      for (let d = 0; d < payment.durationMonths; d++) {
        const date = new Date(pYear, pMonthNum - 1 + d, 1);
        const covYear = date.getFullYear();
        const covMonth = date.getMonth() + 1;
        if (covYear !== year) continue; // only populate months in the requested year
        const bm = toBillingMonth(covYear, covMonth);
        coverageMap.set(bm, { payment, isGroupSecondary: d > 0 });
      }
    }

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const billingMonth = toBillingMonth(year, month);
      const label = MONTHS[i];
      const coverage = coverageMap.get(billingMonth) ?? null;
      const payment = coverage?.payment ?? null;
      const isGroupSecondary = coverage?.isGroupSecondary ?? false;

      if (isBeforeStartDate(year, month, line.startDate)) {
        return {
          year,
          month,
          label,
          billingMonth,
          status: "before_start" as MonthStatus,
          payment: null,
          isGroupSecondary: false,
          balance: 0,
          skip: null,
        };
      }

      // A payment with amountPaid = 0 is treated as no payment (slot reserved but unpaid).
      const isEffectivelyPaid = payment !== null && payment.voidedAt === null && payment.amountPaid > 0;
      const skip = skipByMonth.get(billingMonth) ?? null;

      let status: MonthStatus;
      if (isEffectivelyPaid) {
        // A partial payment (balance > 0) counts as "paid" — the month looks
        // settled and the remaining amount is surfaced as a debt (never here).
        // The owed amount still rides along on `balance` for drill-in views.
        status = "paid";
      } else if (skip) {
        // Nothing is expected this month. Ranks below "paid" (money always wins)
        // and above future/unpaid, so a skipped month is never overdue and never
        // payable until it is unskipped.
        status = "skipped";
      } else if (year > cy || (year === cy && month > cm)) {
        status = "future";
      } else if (isNotDueYet(unpaidRule, year, month, line.startDate)) {
        // 'customer_start_day' rule: the CURRENT month is not owed until the
        // line's own billing day arrives. Reported as "future" — the month stays
        // fully payable (pay-early is allowed) but counts as nothing owed yet.
        // Past months are always red; what waits for the billing day there is the
        // customer's "Overdue" flag, not the cell (isNotLateYet, #83).
        status = "future";
      } else {
        // Past month, or a current month whose due day has arrived.
        status = "unpaid";
      }

      const balance = isEffectivelyPaid ? (payment?.balance ?? 0) : 0;

      return {
        year,
        month,
        label,
        billingMonth,
        status,
        payment,
        isGroupSecondary,
        balance,
        skip: status === "skipped" ? skip : null,
      };
    });
  }
}

export default new PaymentService()

// Shared validation for a single-month payment input (used by createPayment and
// the batch createPayments).
function validateCreatePayment(data: CreatePaymentInput): void {
  if (data.amountDue <= 0) throw new Error(i18n.t("errors.amount_due_positive"));
  if (data.amountPaid < 0) throw new Error(i18n.t("errors.amount_paid_negative"));
  if (data.amountPaid > data.amountDue) {
    throw new Error(i18n.t("errors.amount_paid_exceeds_due"));
  }
  if (!data.billingMonth.endsWith("-01")) {
    throw new Error(i18n.t("errors.billing_month_format"));
  }
  if (!(data.ratePerUsdSnapshot > 0)) {
    throw new Error(i18n.t("errors.rate_snapshot_positive"));
  }
}

function toPaymentPayload(data: CreatePaymentInput) {
  return {
    billing_month: data.billingMonth,
    amount_due: data.amountDue,
    amount_paid: data.amountPaid,
    duration_months: data.durationMonths,
    currency_id: data.currencyId,
    rate_per_usd_snapshot: data.ratePerUsdSnapshot,
    customer_id: data.customerId,
    customer_plan_id: data.customerPlanId,
    plan_id: data.planId,
    received_by_user_id: data.receivedByUserId,
    tenant_id: data.tenantId,
    notes: data.notes,
  };
}

// Resolves a multi-month block against the already-covered months: returns the
// effective start (first non-covered month in the range), the duration from
// there to the end of the original window, and the months stepped over because
// they were already paid. effectiveDuration <= 0 means the whole block is covered.
function resolveMultiMonthBlock(
  startMonth: string,
  plan: Plan,
  covered: Set<string>,
): { effectiveStart: string; effectiveDuration: number; conflictMonths: MultiMonthConflict[] } {
  const [startYear, startMonthNum] = startMonth.split("-").map(Number);
  const conflictMonths: MultiMonthConflict[] = [];
  let effectiveStart = startMonth;
  let effectiveDuration = plan.durationMonths;
  let foundStart = false;

  for (let d = 0; d < plan.durationMonths; d++) {
    const date = new Date(startYear, startMonthNum - 1 + d, 1);
    const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
    if (covered.has(bm)) {
      conflictMonths.push({ billingMonth: bm, label: MONTHS[date.getMonth()] });
    } else if (!foundStart) {
      effectiveStart = bm;
      effectiveDuration = plan.durationMonths - d;
      foundStart = true;
    }
  }

  // Every month in the window was already covered.
  if (conflictMonths.length === plan.durationMonths) effectiveDuration = 0;

  return { effectiveStart, effectiveDuration, conflictMonths };
}

// A block payment may not silently pay over a skipped month — the block covers
// consecutive months and cannot leave a hole, so the whole payment is refused
// and the user is told which months to unskip first.
function assertNoSkippedMonths(
  startMonth: string,
  durationMonths: number,
  lineSkips: SkippedMonth[],
): void {
  if (lineSkips.length === 0) return;
  const active = new Set(lineSkips.filter((s) => s.skipped).map((s) => s.billingMonth));
  if (active.size === 0) return;
  const [startYear, startMonthNum] = startMonth.split("-").map(Number);
  const hits: string[] = [];
  for (let d = 0; d < durationMonths; d++) {
    const date = new Date(startYear, startMonthNum - 1 + d, 1);
    const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
    if (active.has(bm)) hits.push(i18n.t(`months.${MONTHS[date.getMonth()]}`));
  }
  if (hits.length > 0) {
    throw new Error(i18n.t("errors.months_skipped", { months: hits.join(", ") }));
  }
}

// Buckets rows by a key — used to slice one tenant-wide fetch per customer.
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

// Returns a Set of billing months already covered by the given payments (including multi-month ranges).
// Payments with amountPaid = 0 are excluded — they are treated as unpaid (slot reserved only).
function buildCoverageSet(payments: Payment[]): Set<string> {
  const covered = new Set<string>();
  for (const payment of payments) {
    if (payment.voidedAt !== null || payment.amountPaid === 0) continue;
    const [pYear, pMonthNum] = payment.billingMonth.split("-").map(Number);
    for (let d = 0; d < payment.durationMonths; d++) {
      const date = new Date(pYear, pMonthNum - 1 + d, 1);
      covered.add(toBillingMonth(date.getFullYear(), date.getMonth() + 1));
    }
  }
  return covered;
}
