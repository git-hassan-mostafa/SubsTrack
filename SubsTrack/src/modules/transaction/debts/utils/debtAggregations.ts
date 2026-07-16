import type { DebtItem, DebtPaymentItem, DebtSummary } from '@/src/core/types';

// One row per customer who still owes money (net debt in USD).
export interface Debtor {
  customerId: string;
  customerName: string;
  netUsd: number;
}

// Gross / paid / net in USD for a set of debt rows, each converted via its own
// frozen ratePerUsdSnapshot (drift-free) — same math as DebtService.sumUsd, but
// off already-loaded rows so no re-fetch is needed. Reflects whatever is passed.
export function sumDebtNetUsd(
  items: DebtItem[],
  payments: DebtPaymentItem[],
): DebtSummary {
  const grossUsd = items.reduce(
    (sum, i) => sum + i.remaining / i.ratePerUsdSnapshot,
    0,
  );
  const paymentsUsd = payments.reduce(
    (sum, p) => sum + p.amount / p.ratePerUsdSnapshot,
    0,
  );
  return { grossUsd, paymentsUsd, netUsd: grossUsd - paymentsUsd };
}

// Groups debt rows + payments into one Debtor per customer (net > ~1 cent, name
// kept, sorted most-owed first). The 0.005 threshold + USD-via-snapshot logic
// intentionally match DebtService.getNetUsdByCustomer, so the Debtors list and
// the customer-list debt badge always agree.
export function groupDebtors(
  items: DebtItem[],
  payments: DebtPaymentItem[],
): Debtor[] {
  const byCustomer = new Map<string, { name: string; net: number }>();
  const bump = (id: string, name: string, delta: number) => {
    const current = byCustomer.get(id);
    if (current) {
      current.net += delta;
      if (!current.name && name) current.name = name;
    } else {
      byCustomer.set(id, { name, net: delta });
    }
  };
  for (const i of items) {
    bump(i.customerId, i.customerName, i.remaining / i.ratePerUsdSnapshot);
  }
  for (const p of payments) {
    bump(p.customerId, p.customerName, -(p.amount / p.ratePerUsdSnapshot));
  }
  return [...byCustomer.entries()]
    .filter(([, v]) => v.net > 0.005)
    .map(([customerId, v]) => ({
      customerId,
      customerName: v.name,
      netUsd: v.net,
    }))
    .sort((a, b) => b.netUsd - a.netUsd);
}
