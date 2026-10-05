import type { AllocationLine, OpenItem } from "@shared/core/types";
import type { Tone } from "@shared/shared/lib/tone";
import type { CurrencyPlan } from "./currencyGroups";
import { keyOf } from "./waterfall";

export type AllocationStatus = "skipped" | "pays_in_full" | "leaves_owing";

export interface AllocationRow {
  key: string;
  item: OpenItem;
  line: AllocationLine | null;
  position: number | null;
  skipped: boolean;
  status: AllocationStatus | null;
  statusKey: string | null;
  tone: Tone;
  leavesOwing: number;
}

const STATUS_KEYS: Record<AllocationStatus, string> = {
  skipped: "ledger.skipped_bill",
  pays_in_full: "ledger.pays_in_full",
  leaves_owing: "ledger.leaves_owing",
};

const STATUS_TONE: Record<AllocationStatus, Tone> = {
  skipped: "gray",
  pays_in_full: "emerald",
  leaves_owing: "amber",
};

function statusOf(skipped: boolean, line: AllocationLine | null): AllocationStatus | null {
  if (skipped) return "skipped";
  if (!line) return null;
  return line.settles ? "pays_in_full" : "leaves_owing";
}

// Waterfall order; the queue number counts only bills still in the pool.
export function allocationRows(
  items: readonly OpenItem[],
  lines: readonly AllocationLine[],
  excluded: ReadonlySet<string>,
): AllocationRow[] {
  const byKey = new Map(lines.map((l) => [keyOf(l.item), l]));
  let position = 0;
  return items.map((item) => {
    const key = keyOf(item);
    const skipped = excluded.has(key);
    const line = byKey.get(key) ?? null;
    const status = statusOf(skipped, line);
    return {
      key,
      item,
      line,
      position: skipped ? null : ++position,
      skipped,
      status,
      statusKey: status ? STATUS_KEYS[status] : null,
      tone: status ? STATUS_TONE[status] : "gray",
      leavesOwing: line ? item.balance - line.amount : 0,
    };
  });
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function overByText(
  plan: Pick<CurrencyPlan, "leftover" | "skippedCount" | "payable">,
  money: (value: number) => string,
  t: Translate,
): string | null {
  if (plan.leftover <= 0) return null;
  return plan.skippedCount > 0
    ? t("ledger.over_by_skipped", { count: plan.skippedCount, max: money(plan.payable) })
    : t("ledger.over_by", { max: money(plan.payable) });
}

export type CollectBlocker = "lower_amount" | "type_month_amount" | "type_amount";

// Why Save is off: overpaid, an open month with no bill amount, or nothing typed.
export function collectBlocker(form: {
  single: { plan: { overpaying: boolean }; item: Pick<OpenItem, "openAmount">; openBill: number | null } | null;
  pool: { overpaying: boolean };
}): CollectBlocker {
  if (form.single) {
    if (form.single.plan.overpaying) return "lower_amount";
    if (form.single.item.openAmount && !form.single.openBill) return "type_month_amount";
    return "type_amount";
  }
  return form.pool.overpaying ? "lower_amount" : "type_amount";
}

export function collectBlockerKey(form: Parameters<typeof collectBlocker>[0]): string {
  return `ledger.collect_blocker.${collectBlocker(form)}`;
}

export function owedHeadlineKey(billCount: number): string {
  return billCount > 1 ? "ledger.owed_bills" : "ledger.owed";
}
