import type {
  Customer,
  MonthEntry,
  MonthStatus,
  Payment,
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

interface CreatePaymentInput {
  billingMonth: string;
  amount: number;
  customerId: string;
  planId: string | null;
  receivedByUserId: string | null;
  tenantId: string;
}

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

    try {
      const row = await this.repository.create({
        billing_month: data.billingMonth,
        amount: data.amount,
        customer_id: data.customerId,
        plan_id: data.planId,
        received_by_user_id: data.receivedByUserId,
        tenant_id: data.tenantId,
      });
      return mapDbPaymentToPayment(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("uq_payments_customer_month_active") ||
        msg.includes("duplicate")
      ) {
        throw new Error("A payment already exists for this customer and month");
      }
      throw err instanceof Error
        ? err
        : new Error("Connection error. Please try again.");
    }
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

  // THE single source of truth for month status logic. No other file may reimplement this.
  buildMonthGrid(
    customer: Customer,
    payments: Payment[],
    year: number,
    graceDays: number,
  ): MonthEntry[] {
    const { year: cy, month: cm } = getCurrentYearMonth();
    const paymentMap = new Map<string, Payment>();
    payments.forEach((p) => paymentMap.set(p.billingMonth, p));

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const billingMonth = toBillingMonth(year, month);
      const label = MONTHS[i];
      const payment = paymentMap.get(billingMonth) ?? null;

      // Months before the customer's start_date get their own status
      if (isBeforeStartDate(year, month, customer.startDate)) {
        return {
          year,
          month,
          label,
          billingMonth,
          status: "before_start" as MonthStatus,
          payment: null,
        };
      }

      let status: MonthStatus;
      if (payment !== null && payment.voidedAt === null) {
        status = "paid";
      } else if (year > cy || (year === cy && month > cm)) {
        status = "future";
      } else {
        // Grace period: current date within graceDays of billing month start
        const firstOfMonth = new Date(year, month - 1, 1);
        const graceCutoff = new Date(firstOfMonth);
        graceCutoff.setDate(graceCutoff.getDate() + graceDays);
        status = new Date() <= graceCutoff ? "future" : "unpaid";
      }

      return { year, month, label, billingMonth, status, payment };
    });
  }
}
