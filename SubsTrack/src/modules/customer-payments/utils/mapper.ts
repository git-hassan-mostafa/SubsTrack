import type { DbPayment } from "@/src/core/types/db";
import type { Payment } from "@/src/core/types";

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