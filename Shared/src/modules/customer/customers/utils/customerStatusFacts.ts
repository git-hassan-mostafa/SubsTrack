import type {
  ChargeKind,
  Customer,
  CustomerPlan,
  OpenItem,
  Plan,
  PriceHistory,
  StatusBill,
  StatusCustomer,
  StatusLine,
  StatusSkip,
  UnpaidStartRule,
} from "@shared/core/types";
import { balanceUsd, isDebtItem } from "@shared/modules/ledger/utils/debtRule";
import type { RateCurrency } from "@shared/modules/ledger/utils/mergeOwed";
import { priceHistoryOf } from "@shared/modules/customer/customer-plans/utils/priceHistory";

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
  customPrice?: number | null,
  customCurrencyId?: string | null,
];

export type WireDebt = [
  customerId: string,
  kind: ChargeKind,
  balance: number,
  paid: number,
  ratePerUsdSnapshot: number,
  customerPlanId?: string | null,
  billingMonth?: string | null,
];

export type WirePlan = [
  id: string,
  name: string,
  price: number | null,
  isCustomPrice: boolean,
  durationMonths: number,
  currencyId: string | null,
  branchId: string | null,
  tenantId: string,
  createdAt: string,
];

export type WireCurrency = [id: string, ratePerUsd: number];

export type WirePlanChange = [
  id: string,
  planId: string,
  fromMonth: string | null,
  price: number | null,
  currencyId: string | null,
  durationMonths: number,
  isCustomPrice: boolean,
  createdAt: string,
];

export type WireLineChange = [
  id: string,
  customerId: string,
  customerPlanId: string,
  fromMonth: string | null,
  customPrice: number | null,
  customCurrencyId: string | null,
  createdAt: string,
];

// What `customer_status_facts()` returns; positional rows keep it small.
export interface CustomerStatusFactsWire {
  customers: WireCustomer[];
  lines: WireLine[];
  debts: WireDebt[];
  plans?: WirePlan[];
  currencies?: WireCurrency[];
  planChanges?: WirePlanChange[];
  specialPriceChanges?: WireLineChange[];
}

export type StatusListLine = StatusLine &
  Pick<CustomerPlan, "planId" | "customPrice" | "customCurrencyId"> & {
    plan: Plan | null;
  };

export type StatusListCustomer = Omit<StatusCustomer, "customerPlans"> &
  Pick<
    Customer,
    "name" | "phoneNumber" | "address" | "area" | "portalEnabled" | "createdAt"
  > & {
    customerPlans: StatusListLine[];
    lastPaidAt: string | null;
  };

export type OpenBillFact = Pick<
  OpenItem,
  | "customerId"
  | "kind"
  | "balance"
  | "paid"
  | "ratePerUsdSnapshot"
  | "customerPlanId"
  | "billingMonth"
>;

export interface CustomerStatusFacts {
  customers: StatusListCustomer[];
  bills: StatusBill[];
  skips: StatusSkip[];
  open: OpenBillFact[];
  debtUsd: Map<string, number>;
  prices: PriceHistory;
  currencies: RateCurrency[];
  unpaidRule: UnpaidStartRule;
}

function readPlans(wire: WirePlan[]): Plan[] {
  return wire.map(
    ([id, name, price, isCustomPrice, durationMonths, currencyId, branchId, tenantId, createdAt]) => ({
      id,
      name,
      price: price === null ? null : Number(price),
      isCustomPrice,
      durationMonths,
      currencyId,
      branchId,
      tenantId,
      createdAt,
    }),
  );
}

function readPrices(wire: CustomerStatusFactsWire): PriceHistory {
  return priceHistoryOf({
    planChanges: (wire.planChanges ?? []).map(
      ([id, planId, fromMonth, price, currencyId, durationMonths, isCustomPrice, createdAt]) => ({
        id,
        planId,
        fromMonth,
        price: price === null ? null : Number(price),
        currencyId,
        durationMonths,
        isCustomPrice,
        createdAt,
      }),
    ),
    lineChanges: (wire.specialPriceChanges ?? []).map(
      ([id, customerId, customerPlanId, fromMonth, customPrice, customCurrencyId, createdAt]) => ({
        id,
        customerId,
        customerPlanId,
        fromMonth,
        customPrice: customPrice === null ? null : Number(customPrice),
        customCurrencyId,
        createdAt,
      }),
    ),
  });
}

export function readCustomerStatusFacts(
  wire: CustomerStatusFactsWire,
  unpaidRule: UnpaidStartRule,
): CustomerStatusFacts {
  const plans = readPlans(wire.plans ?? []);
  const planById = new Map(plans.map((p) => [p.id, p]));
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
    customPrice = null,
    customCurrencyId = null,
  ] of wire.lines) {
    customers.get(customerId)?.customerPlans.push({
      id,
      startDate,
      active,
      planId,
      customPrice: customPrice === null ? null : Number(customPrice),
      customCurrencyId,
      plan: planId ? (planById.get(planId) ?? null) : null,
    });
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

  const open: OpenBillFact[] = [];
  const debtUsd = new Map<string, number>();
  for (const [
    customerId,
    kind,
    balance,
    paid,
    rate,
    customerPlanId = null,
    billingMonth = null,
  ] of wire.debts) {
    const fact: OpenBillFact = {
      customerId,
      kind,
      balance: Number(balance),
      paid: Number(paid),
      ratePerUsdSnapshot: Number(rate),
      customerPlanId,
      billingMonth,
    };
    open.push(fact);
    if (!isDebtItem(kind, fact.paid)) continue;
    const usd = balanceUsd(fact.balance, fact.ratePerUsdSnapshot);
    debtUsd.set(customerId, (debtUsd.get(customerId) ?? 0) + usd);
  }

  return {
    customers: [...customers.values()],
    bills,
    skips,
    open,
    debtUsd,
    prices: readPrices(wire),
    currencies: (wire.currencies ?? []).map(([id, ratePerUsd]) => ({
      id,
      ratePerUsd: Number(ratePerUsd),
    })),
    unpaidRule,
  };
}
