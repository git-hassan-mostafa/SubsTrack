import type { Plan, PlanPriceChange } from "@shared/core/types";
import { groupBy } from "@shared/core/utils/groupBy";
import {
  usagePriceAt,
  type UsageMonthPrice,
} from "@shared/modules/customer/customer-payments/utils/usageBill";
import type { UsageMonthPriceInput } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";

export interface UsageMonthPriceRow {
  month: string;
  price: UsageMonthPrice;
}

export interface UsagePriceEdit {
  fixedFee?: number | null;
  unitPrice?: number | null;
}

export interface UsagePriceDraft {
  plan: Plan;
  fixedFee: number | null;
  unitPrice: number | null;
  saved: UsageMonthPrice | null;
  savedInOldCurrency: UsageMonthPrice | null;
  last: UsageMonthPriceRow | null;
}

export type UsagePriceDraftState = "empty" | "unchanged" | "ready" | "invalid";

type ReadyDraft = UsagePriceDraft & { fixedFee: number; unitPrice: number };

// One row per priced month, newest first; the latest save of a month wins.
export function usageMonthPriceRows(changes: PlanPriceChange[]): UsageMonthPriceRow[] {
  const months = [
    ...new Set(changes.map((c) => c.fromMonth).filter((m): m is string => m !== null)),
  ].sort((a, b) => (a > b ? -1 : 1));
  return months.flatMap((month) => {
    const price = usagePriceAt(changes, month);
    return price ? [{ month, price }] : [];
  });
}

// Typed wins over saved; a price saved in the plan's old currency is never prefilled.
export function usagePriceDraftsOf(
  plans: Plan[],
  changes: PlanPriceChange[],
  month: string,
  edits: Record<string, UsagePriceEdit>,
): UsagePriceDraft[] {
  const byPlan = groupBy(changes, (c) => c.planId);
  return plans
    .filter((plan) => plan.usage)
    .map((plan) => {
      const planChanges = byPlan.get(plan.id) ?? [];
      const monthPrice = usagePriceAt(planChanges, month);
      const sameCurrency = monthPrice?.currencyId === plan.currencyId;
      const saved = sameCurrency ? monthPrice : null;
      const edit = edits[plan.id] ?? {};
      return {
        plan,
        fixedFee: edit.fixedFee !== undefined ? edit.fixedFee : (saved?.fixedFee ?? null),
        unitPrice: edit.unitPrice !== undefined ? edit.unitPrice : (saved?.unitPrice ?? null),
        saved,
        savedInOldCurrency: sameCurrency ? null : monthPrice,
        last: usageMonthPriceRows(planChanges).find((row) => row.month < month) ?? null,
      };
    });
}

// A saved month price can be replaced, never cleared — so emptying one is invalid.
export function usagePriceDraftState(draft: UsagePriceDraft): UsagePriceDraftState {
  const { fixedFee, unitPrice, saved } = draft;
  if (fixedFee === null && unitPrice === null) return saved ? "invalid" : "empty";
  if (fixedFee === null || unitPrice === null) return "invalid";
  if (!(unitPrice > 0) || fixedFee < 0) return "invalid";
  const same = saved !== null && saved.fixedFee === fixedFee && saved.unitPrice === unitPrice;
  return same ? "unchanged" : "ready";
}

function isReady(draft: UsagePriceDraft): draft is ReadyDraft {
  return usagePriceDraftState(draft) === "ready";
}

export function usagePricesToSave(drafts: UsagePriceDraft[]): UsageMonthPriceInput[] {
  return drafts.filter(isReady).map(({ plan, unitPrice, fixedFee }) => ({
    plan,
    unitPrice,
    fixedFee,
  }));
}

export function hasUsagePriceEdits(drafts: UsagePriceDraft[]): boolean {
  return drafts.some((d) => {
    const state = usagePriceDraftState(d);
    return state === "ready" || state === "invalid";
  });
}

export function canSaveUsagePrices(drafts: UsagePriceDraft[]): boolean {
  return (
    drafts.some(isReady) && !drafts.some((d) => usagePriceDraftState(d) === "invalid")
  );
}
