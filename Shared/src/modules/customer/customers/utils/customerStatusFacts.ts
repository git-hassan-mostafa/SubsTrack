import type {
  ChargeKind,
  Customer,
  CustomerPlan,
  StatusBill,
  StatusCustomer,
  StatusLine,
  StatusSkip,
  UnpaidStartRule,
} from "@shared/core/types";
import { balanceUsd, isDebtItem } from "@shared/modules/ledger/utils/debtRule";

export type WireCustomer = [
  id: string,
  name: string,
  phoneNumber: string | null,
  address: string | null,
  area: string | null,
  active: boolean,
  isRegular: boolean,
  portalEnabled?: boolean,
  createdAt?: string,
  lastPaidAt?: string | null,
];

export type WireBill = [
  billingMonth: string,
  durationMonths: number,
  amount: number,
  paid: number,
  writtenOffAt?: string | null,
];

export type WireLine = [
  id: string,
  customerId: string,
  startDate: string,
  active: boolean,
  bills: WireBill[],
  skippedMonths: string[],
  planId?: string | null,
];

export type WireDebt = [
  customerId: string,
  kind: ChargeKind,
  balance: number,
  paid: number,
  ratePerUsdSnapshot: number,
];

// What `customer_status_facts()` returns; positional rows keep it small.
export interface CustomerStatusFactsWire {
  customers: WireCustomer[];
  lines: WireLine[];
  debts: WireDebt[];
}

export type StatusListLine = StatusLine & Pick<CustomerPlan, "planId">;

export type StatusListCustomer = Omit<StatusCustomer, "customerPlans"> &
  Pick<
    Customer,
    "name" | "phoneNumber" | "address" | "area" | "portalEnabled" | "createdAt"
  > & {
    customerPlans: StatusListLine[];
    lastPaidAt: string | null;
  };

export interface CustomerStatusFacts {
  customers: StatusListCustomer[];
  bills: StatusBill[];
  skips: StatusSkip[];
  debtUsd: Map<string, number>;
  unpaidRule: UnpaidStartRule;
}

export function readCustomerStatusFacts(
  wire: CustomerStatusFactsWire,
  unpaidRule: UnpaidStartRule,
): CustomerStatusFacts {
  const customers = new Map<string, StatusListCustomer>();
  for (const [
    id,
    name,
    phoneNumber,
    address,
    area,
    active,
    isRegular,
    portalEnabled = false,
    createdAt = "",
    lastPaidAt = null,
  ] of wire.customers) {
    customers.set(id, {
      id,
      name,
      phoneNumber,
      address,
      area,
      active,
      isRegular,
      portalEnabled,
      createdAt,
      lastPaidAt,
      customerPlans: [],
    });
  }

  const bills: StatusBill[] = [];
  const skips: StatusSkip[] = [];
  for (const [
    id,
    customerId,
    startDate,
    active,
    lineBills,
    skipped,
    planId = null,
  ] of wire.lines) {
    customers
      .get(customerId)
      ?.customerPlans.push({ id, startDate, active, planId });
    for (const [
      billingMonth,
      durationMonths,
      amount,
      paid,
      writtenOffAt = null,
    ] of lineBills) {
      bills.push({
        charge: {
          customerId,
          customerPlanId: id,
          billingMonth,
          durationMonths,
          amount: Number(amount),
          voidedAt: null,
          writtenOffAt,
        },
        collected: Number(paid),
      });
    }
    for (const billingMonth of skipped) {
      skips.push({
        customerId,
        customerPlanId: id,
        billingMonth,
        skipped: true,
      });
    }
  }

  const debtUsd = new Map<string, number>();
  for (const [customerId, kind, balance, paid, rate] of wire.debts) {
    if (!isDebtItem(kind, Number(paid))) continue;
    const usd = balanceUsd(Number(balance), Number(rate));
    debtUsd.set(customerId, (debtUsd.get(customerId) ?? 0) + usd);
  }

  return {
    customers: [...customers.values()],
    bills,
    skips,
    debtUsd,
    unpaidRule,
  };
}
