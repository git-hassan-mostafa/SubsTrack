import type { AllocationLine, OpenItem } from "@shared/core/types";
import { dayToInstantIso } from "@shared/core/utils/date";
import type { CollectInput } from "@shared/modules/ledger/services/CollectionService";
import type { CurrencyPlan } from "./currencyGroups";
import { linesTotal } from "./waterfall";

export interface CollectGroupSubmit {
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  amount: number;
  lines: { item: OpenItem; amount: number }[];
}

export interface CollectSubmission {
  receivedAt: string;
  notes: string | null;
  groups: CollectGroupSubmit[];
}

export interface SingleCollectPlan {
  target: OpenItem;
  max: number;
  lines: AllocationLine[];
  overpaying: boolean;
  partial: boolean;
}

export interface CollectAuthor {
  tenantId: string;
  receivedByUserId: string;
  customerId: string;
  fallbackBranchId: string | null;
}

// An open item's typed month amount IS its bill, in the currency picked for it.
export function singleCollectPlan(args: {
  item: OpenItem;
  openBill: number | null;
  currencyId: string | null;
  ratePerUsd: number;
  amount: number | null;
}): SingleCollectPlan {
  const { item } = args;
  const target: OpenItem = item.openAmount
    ? {
        ...item,
        amount: args.openBill ?? 0,
        balance: args.openBill ?? 0,
        currencyId: args.currencyId,
        ratePerUsdSnapshot: args.ratePerUsd,
      }
    : item;
  const max = target.balance;
  const value = args.amount ?? 0;
  const take = Math.min(value, max);
  const lines = value > 0 && max > 0 ? [{ item: target, amount: take, settles: take >= max }] : [];
  return { target, max, lines, overpaying: value > max, partial: value > 0 && value < max };
}

export function singleGroups(
  plan: SingleCollectPlan,
  currencyId: string | null,
  ratePerUsd: number,
): CollectGroupSubmit[] {
  return [
    {
      currencyId,
      ratePerUsdSnapshot: ratePerUsd,
      amount: linesTotal(plan.lines),
      lines: plan.lines.map((l) => ({ item: l.item, amount: l.amount })),
    },
  ];
}

// One group per funded currency — each becomes its own hand-over (gotcha #108).
export function poolGroups(funded: CurrencyPlan[]): CollectGroupSubmit[] {
  return funded.map((p) => ({
    currencyId: p.currencyId,
    ratePerUsdSnapshot: p.ratePerUsd,
    amount: linesTotal(p.lines),
    lines: p.lines.map((l) => ({ item: l.item, amount: l.amount })),
  }));
}

// An untouched date field means "now", to the second — not the minute shown.
export function receivedAtIso(value: string, picked: boolean): string {
  return picked ? dayToInstantIso(value) : new Date().toISOString();
}

// The branch comes off the bills: a debts list never loads the whole customer.
export function collectInputsFor(
  submission: CollectSubmission,
  author: CollectAuthor,
): CollectInput[] {
  return submission.groups.map((group) => ({
    tenantId: author.tenantId,
    customerId: author.customerId,
    branchId: group.lines[0]?.item.branchId ?? author.fallbackBranchId,
    amount: group.amount,
    currencyId: group.currencyId,
    ratePerUsdSnapshot: group.ratePerUsdSnapshot,
    receivedAt: submission.receivedAt,
    receivedByUserId: author.receivedByUserId,
    notes: submission.notes,
    lines: group.lines.map((l) => ({
      item: l.item,
      amount: l.amount,
      settles: l.amount >= l.item.balance,
    })),
  }));
}
