import type { Sale } from "@shared/core/types";

const MONEY_EPSILON = 1e-9;

export interface SaleFacts {
  voided: boolean;
  writtenOff: boolean;
  fullyPaid: boolean;
  owed: number;
  canCollect: boolean;
}

// A walk-in sale has no customer to owe, so it is never collected later.
export function saleFacts(sale: Sale): SaleFacts {
  const voided = sale.voidedAt !== null;
  const owed = sale.totalAmount - sale.amountPaid;
  return {
    voided,
    writtenOff: !voided && sale.charge?.writtenOffAt != null,
    fullyPaid: sale.amountPaid >= sale.totalAmount,
    owed,
    canCollect:
      !voided && owed > MONEY_EPSILON && !!sale.customerId && !!sale.charge,
  };
}
