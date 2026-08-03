import type {
  CurrentMonthPlanCount,
  Customer,
  CustomerPlan,
  MonthEntry,
  MonthStatus,
  Payment,
  Plan,
  SkippedMonth,
  TierPlan,
  UnpaidStartRule,
} from "@/src/core/types";
import { MONTHS, type BranchFilter } from "@/src/core/constants";
import {
  getCurrentYearMonth,
  isBeforeStartDate,
  isNotDueYet,
  toBillingMonth,
} from "@/src/core/utils/date";
import { DEFAULT_UNPAID_START_RULE } from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import i18n from "@/src/core/i18n";
import repository from "../repository/PaymentRepository";
import type { MonthStatusSets } from "../repository/IPaymentRepository";
import skippedMonthService from "./SkippedMonthService";
import { tierService } from "@/src/modules/admin/subscription";
import { mapDbPaymentToPayment, mapDbPaymentRowToListItem } from "../utils/mapper";
import { CreateMultiMonthPaymentResult, FindPaymentsOptions, MultiMonthConflict, PaymentListItem } from "../utils/types";

type CreatePaymentInput = Pick<Payment, 'billingMonth' | 'amountDue' | 'amountPaid' | 'durationMonths' | 'currencyId' | 'ratePerUsdSnapshot' | 'customerId' | 'customerPlanId' | 'planId' | 'receivedByUserId' | 'tenantId' | 'notes'>

// One entry in a customer-list bulk quick pay: a single fixed-price service line
// paid for `billingMonth` with its plan + frozen rate. Multi-month plans become
// a block payment covering plan.durationMonths from billingMonth. A customer with
// several lines contributes one entry per eligible line ("collect all due").
interface BulkPayCustomerInput {
  customerId: string;
  customerPlanId: string;
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
    const rows = await repository.monthlyTotals(opts);
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
        customerPlanId: i.customerPlanId,
        planId: i.plan.id,
        receivedByUserId,
        tenantId,
        notes: null,
      };
    });
    paymentInputs.forEach(validateCreatePayment);
    const rows = await repository.createMany(paymentInputs.map(toPaymentPayload));
    return rows.map(mapDbPaymentToPayment);
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
    const trimmed = notes.trim();
    const rows = await repository.voidMany(ids, voidedBy, trimmed || null);
    return rows.map(mapDbPaymentToPayment);
  }

  async findPaymentStatusForMonth(
    billingMonth: string,
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Promise<MonthStatusSets> {
    return repository.findPaymentStatusForMonth(billingMonth, unpaidRule);
  }

  // Returns the IDs of active, regular customers that have at least one unpaid
  // month on ANY of their active service lines, from the line's start date
  // through the current year — even if the current month itself is paid. Status
  // is decided exclusively by buildMonthGrid (rule #1): a customer is overdue if
  // any month of any active line resolves to "unpaid" (a skipped month never does).
  async findOverdueCustomerIds(
    customers: Customer[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): Promise<Set<string>> {
    const [rows, skips] = await Promise.all([
      repository.findActivePayments(),
      skippedMonthService.getActiveSkips(),
    ]);
    const paymentsByLine = new Map<string, Payment[]>();
    for (const row of rows) {
      const payment = mapDbPaymentToPayment(row);
      const list = paymentsByLine.get(payment.customerPlanId);
      if (list) list.push(payment);
      else paymentsByLine.set(payment.customerPlanId, [payment]);
    }
    const skipsByLine = groupSkipsByLine(skips);

    const { year: currentYear } = getCurrentYearMonth();
    const overdue = new Set<string>();
    for (const customer of customers) {
      if (!customer.active || !customer.isRegular) continue;
      const lines = (customer.customerPlans ?? []).filter((l) => l.active);
      const isOverdue = lines.some((line) => {
        const payments = paymentsByLine.get(line.id) ?? [];
        const lineSkips = skipsByLine.get(line.id) ?? [];
        const startYear = new Date(line.startDate).getFullYear();
        for (let year = startYear; year <= currentYear; year++) {
          const grid = this.buildMonthGrid(line, payments, lineSkips, year, unpaidRule);
          if (grid.some((entry) => entry.status === "unpaid")) return true;
        }
        return false;
      });
      if (isOverdue) overdue.add(customer.id);
    }
    return overdue;
  }

  // Aggregates a customer's CURRENT-month status across its active lines, for the
  // customer-list badge / status sets. Used by the slice after a create/void to
  // keep the badge in sync without re-fetching. Rules:
  //   none    — no line has a covering payment this month
  //   full    — every started, due line has a covering payment (a partial
  //             payment counts as covered; its balance becomes a debt)
  //   partial — some lines are covered but at least one started line is unpaid
  //   skipped — every started line is skipped, so nothing is owed at all
  //   notDueYet — every started line is still before its billing day
  //             ('customer_start_day' rule), so nothing is owed YET
  // Also returns the plan tally for the "N/M plans paid" badge:
  //   total   — started lines that are DUE (grid status != before_start and
  //             != skipped)
  //   paid    — started lines fully settled this month (grid status "paid")
  // Lines that are skipped or before start are not "owed" and don't block
  // "full". This mirrors the SQL path in
  // PaymentRepository.findPaymentStatusForMonth, so both stay in lockstep.
  // Also returns notDueLineIds — lines that must not be quick-paid this month
  // because they are already covered by a payment, or skipped.
  computeCurrentMonthStatus(
    lines: CustomerPlan[],
    payments: Payment[],
    skips: SkippedMonth[],
    unpaidRule: UnpaidStartRule = DEFAULT_UNPAID_START_RULE,
  ): {
    status: "full" | "partial" | "none" | "skipped" | "notDueYet";
    count: CurrentMonthPlanCount;
    notDueLineIds: string[];
  } {
    const { year, month } = getCurrentYearMonth();
    let anyCovered = false;
    let allOwedPaid = true;
    let anySkipped = false;
    let anyNotDueYet = false;
    let paid = 0;
    let total = 0;
    const notDueLineIds: string[] = [];
    for (const line of lines) {
      if (!line.active) continue;
      const linePayments = payments.filter((p) => p.customerPlanId === line.id);
      const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
      const entry = this.buildMonthGrid(line, linePayments, lineSkips, year, unpaidRule).find(
        (e) => e.month === month,
      );
      if (!entry || entry.status === "before_start") continue; // not started
      // A skipped month is owed by nobody: it neither counts in the tally nor
      // blocks "full", and quick pay must leave it alone.
      if (entry.status === "skipped") {
        notDueLineIds.push(line.id);
        anySkipped = true;
        continue;
      }
      // 'customer_start_day' rule: the current month hasn't reached this line's
      // billing day, so nothing is owed yet — it must not count in the tally or
      // block "full". Unlike a skip it stays quick-payable, so it is NOT added
      // to notDueLineIds.
      if (entry.status === "future") {
        anyNotDueYet = true;
        continue;
      }
      total++;
      // A partial month resolves to "paid" (its balance becomes a debt), so a
      // covered line always counts toward "paid" here — never as unsettled.
      if (entry.status === "paid") {
        anyCovered = true;
        paid++;
        notDueLineIds.push(line.id);
      } else if (entry.status === "unpaid") allOwedPaid = false;
    }
    // Every started line dropped out → nothing owed, so the list must not fall
    // back to its red "unpaid" default. An explicit skip outranks "not due yet",
    // since it is a deliberate choice worth showing. Mirrors the repository's
    // `total === 0` branch.
    const status =
      total === 0 && anySkipped
        ? "skipped"
        : total === 0 && anyNotDueYet
          ? "notDueYet"
          : !anyCovered
            ? "none"
            : allOwedPaid
              ? "full"
              : "partial";
    return { status, count: { paid, total }, notDueLineIds };
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
        // 'customer_start_day' rule: the current month is not overdue until the
        // line's own billing day arrives. Reported as "future" — the month stays
        // fully payable (pay-early is allowed) but counts as nothing owed yet.
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

// Active skips grouped by service line, for the per-line grid builds.
function groupSkipsByLine(skips: SkippedMonth[]): Map<string, SkippedMonth[]> {
  const map = new Map<string, SkippedMonth[]>();
  for (const skip of skips) {
    const list = map.get(skip.customerPlanId);
    if (list) list.push(skip);
    else map.set(skip.customerPlanId, [skip]);
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
