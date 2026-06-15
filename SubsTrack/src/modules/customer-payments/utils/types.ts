import { Payment } from "@/src/core/types";

export type MultiMonthConflict = {
    billingMonth: string;
    label: string;
};

export type CreateMultiMonthPaymentResult = {
    payment: Payment;
    skippedMonths: MultiMonthConflict[];
};