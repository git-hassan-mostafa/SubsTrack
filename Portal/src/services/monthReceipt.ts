import type { Charge, Collection } from "@/src/core/types";

export interface MonthReceiptPayment {
  collection: Collection;
  amount: number;
}

export interface MonthReceipt {
  charge: Charge;
  payments: MonthReceiptPayment[];
  paid: number;
  remaining: number;
}

const EPSILON = 0.00000001;

// One month bill and every hand-over that reached it. A month can be settled by
// several payments, and one hand-over can pay several bills, so the slice that
// belongs to THIS bill is the sum of its collection_items - never the
// hand-over's own total (gotcha #107).
export function buildMonthReceipt(
  charge: Charge,
  collections: Collection[],
): MonthReceipt {
  const payments: MonthReceiptPayment[] = [];

  for (const collection of collections) {
    const amount = (collection.items ?? [])
      .filter((item) => item.chargeId === charge.id)
      .reduce((sum, item) => sum + item.amount, 0);
    if (amount > EPSILON) payments.push({ collection, amount });
  }

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = charge.amount - paid;

  return {
    charge,
    payments,
    paid,
    remaining: remaining > EPSILON ? remaining : 0,
  };
}
