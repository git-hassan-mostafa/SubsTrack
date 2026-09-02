import type {
  Charge,
  Collection,
  CollectionItem,
  Currency,
  Customer,
  CustomerPlan,
  MonthBill,
  OpenItem,
  Plan,
  SkippedMonth,
} from '@/src/core/types';

// Tiny builders so a test says only what it is about. Every default is the
// boring case: USD, one month, nothing voided, nothing collected.

let seq = 0;
export const id = (prefix = 'id') => `${prefix}-${++seq}`;
export const resetIds = () => {
  seq = 0;
};

export const LBP: Currency = {
  id: 'cur-lbp',
  tenantId: 't1',
  code: 'LBP',
  name: 'Lira',
  symbol: 'L.L.',
  ratePerUsd: 90000,
  decimals: 0,
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: over.id ?? id('plan'),
    name: 'Internet',
    price: 20,
    isCustomPrice: false,
    durationMonths: 1,
    currencyId: null,
    branchId: null,
    tenantId: 't1',
    createdAt: '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

export function line(over: Partial<CustomerPlan> = {}): CustomerPlan {
  return {
    id: over.id ?? id('line'),
    customerId: 'cust-1',
    planId: over.plan?.id ?? null,
    startDate: '2026-01-01',
    cancelledAt: null,
    active: true,
    customPrice: null,
    customCurrencyId: null,
    tenantId: 't1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

export function charge(over: Partial<Charge> = {}): Charge {
  const kind = over.kind ?? 'month';
  return {
    id: over.id ?? id('chg'),
    tenantId: 't1',
    branchId: null,
    customerId: 'cust-1',
    kind,
    customerPlanId: kind === 'month' ? 'line-1' : null,
    billingMonth: kind === 'month' ? '2026-01-01' : null,
    durationMonths: 1,
    planId: null,
    saleId: kind === 'sale' ? 'sale-1' : null,
    description: kind === 'manual' ? 'Installation' : null,
    amount: 20,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    issuedAt: '2026-01-05T10:00:00.000Z',
    dueDate: kind === 'month' ? (over.billingMonth ?? '2026-01-01') : '2026-01-05',
    recordedByUserId: 'user-1',
    notes: null,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    writtenOffAt: null,
    writtenOffBy: null,
    writeOffReason: null,
    ...over,
  };
}

/** A month bill for `billingMonth` on `lineId`, with `collected` against it. */
export function bill(
  billingMonth: string,
  collected: number,
  over: Partial<Charge> = {},
): MonthBill {
  return {
    charge: charge({
      kind: 'month',
      billingMonth,
      dueDate: billingMonth,
      customerPlanId: over.customerPlanId ?? 'line-1',
      ...over,
    }),
    collected,
  };
}

export function skip(
  billingMonth: string,
  over: Partial<SkippedMonth> = {},
): SkippedMonth {
  return {
    id: over.id ?? id('skip'),
    tenantId: 't1',
    customerId: 'cust-1',
    customerPlanId: 'line-1',
    billingMonth,
    skipped: true,
    note: null,
    skippedByUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

export function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: over.id ?? 'cust-1',
    name: 'Ali',
    phoneNumber: '70123456',
    address: 'Street 1',
    area: null,
    notes: null,
    locationUrl: null,
    active: true,
    isRegular: true,
    branchId: null,
    tenantId: 't1',
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    customerPlans: [],
    ...over,
  };
}

export function openItem(over: Partial<OpenItem> = {}): OpenItem {
  const amount = over.amount ?? 20;
  const paid = over.paid ?? 0;
  return {
    chargeId: over.chargeId !== undefined ? over.chargeId : id('chg'),
    kind: 'month',
    customerId: 'cust-1',
    customerName: 'Ali',
    branchId: null,
    customerPlanId: 'line-1',
    billingMonth: '2026-01-01',
    durationMonths: 1,
    planId: null,
    saleId: null,
    label: 'Jan 2026',
    amount,
    paid,
    balance: over.balance ?? amount - paid,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    dueDate: '2026-01-01',
    issuedAt: '2026-01-01',
    createdAt: '2026-01-01',
    isDebt: false,
    ...over,
  };
}

export function collectionItem(over: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: over.id ?? id('ci'),
    tenantId: 't1',
    collectionId: 'col-1',
    chargeId: 'chg-1',
    amount: 20,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...over,
  };
}

export function collection(over: Partial<Collection> = {}): Collection {
  return {
    id: over.id ?? 'col-1',
    tenantId: 't1',
    branchId: null,
    customerId: 'cust-1',
    amount: 20,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    receivedAt: '2026-02-01T10:00:00.000Z',
    receivedByUserId: 'user-1',
    notes: null,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    heldByUserId: 'user-1',
    remittedAt: null,
    remittedBy: null,
    items: [],
    ...over,
  };
}
