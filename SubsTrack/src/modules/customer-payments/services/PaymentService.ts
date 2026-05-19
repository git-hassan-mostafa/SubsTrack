import type {
  Customer,
  MonthEntry,
  MonthStatus,
  Payment,
  Plan,
} from "@/src/core/types";
import type { DbPayment } from "@/src/core/types/db";
import { MONTHS } from "@/src/core/constants";
import {
  getCurrentYearMonth,
  isBeforeStartDate,
  toBillingMonth,
} from "@/src/core/utils/date";
import { PaymentRepository } from "../repository/PaymentRepository";

function mapDbPaymentToPayment(db: DbPayment): Payment {
  return {
    id: db.id,
    billingMonth: db.billing_month,
    amount: db.amount,
    durationMonths: db.duration_months,
    customerId: db.customer_id,
    planId: db.plan_id,
    receivedByUserId: db.received_by_user_id,
    tenantId: db.tenant_id,
    paidAt: db.paid_at,
    voidedAt: db.voided_at,
    voidedBy: db.voided_by,
    notes: db.notes,
    createdAt: db.created_at,
  };
}

type CreatePaymentInput = Pick<Payment, 'billingMonth' | 'amount' | 'durationMonths' | 'customerId' | 'planId' | 'receivedByUserId' | 'tenantId' | 'notes'>

export type MultiMonthConflict = {
  billingMonth: string;
  label: string;
};

export type CreateMultiMonthPaymentResult = {
  payment: Payment;
  skippedMonths: MultiMonthConflict[];
};

export class PaymentService {
  private repository = new PaymentRepository();

  async getPaymentsForYear(
    customerId: string,
    year: number,
  ): Promise<Payment[]> {
    const rows = await this.repository.findByCustomerAndYear(customerId, year);
    return rows.map(mapDbPaymentToPayment);
  }

  async createPayment(data: CreatePaymentInput): Promise<Payment> {
    if (data.amount <= 0) throw new Error("Amount must be greater than 0");
    if (!data.billingMonth.endsWith("-01")) {
      throw new Error("Billing month must be the first day of the month");
    }

    const row = await this.repository.create({
      billing_month: data.billingMonth,
      amount: data.amount,
      duration_months: data.durationMonths,
      customer_id: data.customerId,
      plan_id: data.planId,
      received_by_user_id: data.receivedByUserId,
      tenant_id: data.tenantId,
      notes: data.notes,
    });
    return mapDbPaymentToPayment(row);
  }

  // Creates a multi-month payment starting at startMonth covering durationMonths months.
  // existingPayments: the current payments for this customer (to detect conflicts).
  // skipConflicts: if true, skips already-covered months; if false, throws on conflict.
  async createMultiMonthPayment(
    startMonth: string,
    customer: Customer,
    plan: Plan,
    receivedByUserId: string,
    notes: string | null,
    tenantId: string,
    existingPayments: Payment[],
    skipConflicts: boolean,
  ): Promise<CreateMultiMonthPaymentResult> {
    if (!startMonth.endsWith("-01")) {
      throw new Error("Billing month must be the first day of the month");
    }
    if (!plan.price || plan.price <= 0) {
      throw new Error("Plan must have a fixed price to record a multi-month payment");
    }

    const coveredByExisting = buildCoverageSet(existingPayments);

    // Find which months in the proposed range are already covered.
    const [startYear, startMonthNum] = startMonth.split("-").map(Number);
    const skippedMonths: MultiMonthConflict[] = [];
    let actualStartMonth: string | null = null;

    for (let d = 0; d < plan.durationMonths; d++) {
      const date = new Date(startYear, startMonthNum - 1 + d, 1);
      const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
      if (coveredByExisting.has(bm)) {
        skippedMonths.push({ billingMonth: bm, label: MONTHS[date.getMonth()] });
      } else if (actualStartMonth === null) {
        actualStartMonth = bm;
      }
    }

    if (!skipConflicts && skippedMonths.length > 0) {
      throw new Error(
        `The following months are already paid: ${skippedMonths.map((m) => m.label).join(", ")}`,
      );
    }

    // Determine the effective start month and duration after skipping conflicts.
    // We record a single payment starting at the first non-conflicting month in the range.
    // The duration covers from that point to the end of the original block.
    let effectiveStart = startMonth;
    let effectiveDuration = plan.durationMonths;

    if (skipConflicts && skippedMonths.length > 0) {
      // Find the first non-covered month in the range.
      for (let d = 0; d < plan.durationMonths; d++) {
        const date = new Date(startYear, startMonthNum - 1 + d, 1);
        const bm = toBillingMonth(date.getFullYear(), date.getMonth() + 1);
        if (!coveredByExisting.has(bm)) {
          effectiveStart = bm;
          effectiveDuration = plan.durationMonths - d;
          break;
        }
      }
      // If all months are covered, nothing to create.
      if (effectiveDuration <= 0) {
        throw new Error("All months in this block are already paid");
      }
    }

    const row = await this.repository.create({
      billing_month: effectiveStart,
      amount: plan.price,
      duration_months: effectiveDuration,
      customer_id: customer.id,
      plan_id: plan.id,
      received_by_user_id: receivedByUserId,
      tenant_id: tenantId,
      notes,
    });

    return { payment: mapDbPaymentToPayment(row), skippedMonths };
  }

  async updatePaymentAmount(id: string, amount: number): Promise<Payment> {
    if (amount <= 0) throw new Error("Amount must be greater than 0");
    const row = await this.repository.updateAmount(id, amount);
    return mapDbPaymentToPayment(row);
  }

  async voidPayment(
    id: string,
    voidedBy: string,
    notes: string,
  ): Promise<Payment> {
    if (!notes.trim())
      throw new Error("A reason is required to void a payment");
    const row = await this.repository.voidPayment(id, voidedBy, notes.trim());
    return mapDbPaymentToPayment(row);
  }

  async findPaidCustomerIdsForMonth(billingMonth: string): Promise<Set<string>> {
    return this.repository.findPaidCustomerIdsForMonth(billingMonth);
  }

  // THE single source of truth for month status logic. No other file may reimplement this.
  buildMonthGrid(
    customer: Customer,
    payments: Payment[],
    year: number,
    graceDays: number,
  ): MonthEntry[] {
    const { year: cy, month: cm } = getCurrentYearMonth();

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

      if (isBeforeStartDate(year, month, customer.startDate)) {
        return {
          year,
          month,
          label,
          billingMonth,
          status: "before_start" as MonthStatus,
          payment: null,
          isGroupSecondary: false,
        };
      }

      let status: MonthStatus;
      if (payment !== null && payment.voidedAt === null) {
        status = "paid";
      } else if (year > cy || (year === cy && month > cm)) {
        status = "future";
      } else {
        const firstOfMonth = new Date(year, month - 1, 1);
        const graceCutoff = new Date(firstOfMonth);
        graceCutoff.setDate(graceCutoff.getDate() + graceDays);
        status = new Date() <= graceCutoff ? "future" : "unpaid";
      }

      return { year, month, label, billingMonth, status, payment, isGroupSecondary };
    });
  }
}

// Returns a Set of billing months already covered by the given payments (including multi-month ranges).
function buildCoverageSet(payments: Payment[]): Set<string> {
  const covered = new Set<string>();
  for (const payment of payments) {
    if (payment.voidedAt !== null) continue;
    const [pYear, pMonthNum] = payment.billingMonth.split("-").map(Number);
    for (let d = 0; d < payment.durationMonths; d++) {
      const date = new Date(pYear, pMonthNum - 1 + d, 1);
      covered.add(toBillingMonth(date.getFullYear(), date.getMonth() + 1));
    }
  }
  return covered;
}
