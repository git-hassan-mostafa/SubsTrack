import type { ChargeUsage, OpenItem } from "@shared/core/types";

// A month with NO bill yet, derived from the grid; collecting raises its charge.
export function virtualMonthItem(args: {
  customerId: string;
  customerName: string;
  branchId: string | null;
  customerPlanId: string;
  billingMonth: string;
  durationMonths: number;
  planId: string | null;
  label: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
  openAmount?: boolean;
  earlierPrice?: boolean;
  usage?: ChargeUsage | null;
}): OpenItem {
  return {
    chargeId: null,
    kind: "month",
    customerId: args.customerId,
    customerName: args.customerName,
    branchId: args.branchId,
    customerPlanId: args.customerPlanId,
    billingMonth: args.billingMonth,
    durationMonths: args.durationMonths,
    planId: args.planId,
    saleId: null,
    label: args.label,
    amount: args.amount,
    paid: 0,
    balance: args.amount,
    currencyId: args.currencyId,
    ratePerUsdSnapshot: args.ratePerUsdSnapshot,
    dueDate: args.dueDate,
    issuedAt: args.dueDate,
    createdAt: args.dueDate,
    isDebt: false,
    openAmount: args.openAmount ?? false,
    earlierPrice: args.earlierPrice ?? false,
    usage: args.usage ?? null,
  };
}
