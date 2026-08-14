import type { DbPayment, DbSkippedMonth } from "@/src/core/types/db";
import type { Payment, SkippedMonth } from "@/src/core/types";
import type { PaymentListItem } from "./types";

// A payment row joined with its customer (name + phone) and plan name, as
// returned by PaymentRepository.findAll (PAYMENT_LIST_SELECT). The offline
// sibling attaches the whole customers row, so both paths satisfy this shape.
type DbPaymentListRow = DbPayment & {
    customers?: { name: string; phone_number?: string | null } | null;
    plans?: { name: string } | null;
};

export function mapDbPaymentRowToListItem(db: DbPaymentListRow): PaymentListItem {
    return {
        ...mapDbPaymentToPayment(db),
        customerName: db.customers?.name ?? "",
        customerPhone: db.customers?.phone_number ?? null,
        planName: db.plans?.name ?? null,
    };
}

export function mapDbSkippedMonthToSkippedMonth(db: DbSkippedMonth): SkippedMonth {
    return {
        id: db.id,
        tenantId: db.tenant_id,
        customerId: db.customer_id,
        customerPlanId: db.customer_plan_id,
        billingMonth: db.billing_month,
        skipped: db.skipped,
        note: db.note,
        skippedByUserId: db.skipped_by_user_id,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
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
        heldByUserId: db.held_by_user_id,
        remittedAt: db.remitted_at,
        remittedBy: db.remitted_by,
        createdAt: db.created_at,
    };
}