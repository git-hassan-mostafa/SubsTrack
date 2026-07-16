import type { DbPayment } from "@/src/core/types/db";
import type { Payment } from "@/src/core/types";
import type { PaymentListItem } from "./types";

// A payment row joined with its customer name + plan name, as returned by
// PaymentRepository.findAll (select '*, customers!inner(name, branch_id), plans(name)').
type DbPaymentListRow = DbPayment & {
    customers?: { name: string } | null;
    plans?: { name: string } | null;
};

export function mapDbPaymentRowToListItem(db: DbPaymentListRow): PaymentListItem {
    return {
        ...mapDbPaymentToPayment(db),
        customerName: db.customers?.name ?? "",
        planName: db.plans?.name ?? null,
    };
}

export function mapDbPaymentToPayment(db: DbPayment): Payment {
    return {
        id: db.id,
        billingMonth: db.billing_month,
        amountDue: Number(db.amount_due),
        amountPaid: Number(db.amount_paid),
        balance: Number(db.balance),
        durationMonths: db.duration_months,
        currencyId: db.currency_id,
        ratePerUsdSnapshot: Number(db.rate_per_usd_snapshot),
        customerId: db.customer_id,
        customerPlanId: db.customer_plan_id,
        planId: db.plan_id,
        receivedByUserId: db.received_by_user_id,
        tenantId: db.tenant_id,
        paidAt: db.paid_at,
        voidedAt: db.voided_at,
        voidedBy: db.voided_by,
        notes: db.notes,
        remittedAt: db.remitted_at,
        remittedBy: db.remitted_by,
        createdAt: db.created_at,
    };
}