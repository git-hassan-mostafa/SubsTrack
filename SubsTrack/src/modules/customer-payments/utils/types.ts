import { Payment } from "@/src/core/types";
import { BranchFilter } from "@/src/core/constants";

export type MultiMonthConflict = {
    billingMonth: string;
    label: string;
};

export type CreateMultiMonthPaymentResult = {
    payment: Payment;
    skippedMonths: MultiMonthConflict[];
};

// "all" → any settled payment; "paid" → balance cleared; "partial" → balance owed.
export type PaymentStatusFilter = "all" | "paid" | "partial";

// Filters for the tenant-wide Payments list (Invoices → Payments tab).
export interface FindPaymentsOptions {
    page?: number;
    customerId?: string | null;
    receivedByUserId?: string | null;
    // YYYY-MM-01 — the month-grid month the payment is for (exact match).
    billingMonth?: string | null;
    // YYYY-MM-DD — inclusive lower bound on the day the payment was recorded (paid_at >= from).
    paidFrom?: string | null;
    // YYYY-MM-DD — inclusive upper bound on the day the payment was recorded (paid_at within that day).
    paidTo?: string | null;
    status?: PaymentStatusFilter;
    branchFilter?: BranchFilter;
    includeVoided?: boolean;
}

// A payment row enriched with its customer name (and the plan it was for, when
// snapshotted) for the flat list. The recording user's name is resolved
// client-side from the loaded user list.
export interface PaymentListItem extends Payment {
    customerName: string;
    planName: string | null;
}