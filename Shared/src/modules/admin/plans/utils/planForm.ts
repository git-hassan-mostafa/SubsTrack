import type { Plan } from "@shared/core/types";
import { isPositivePrice } from "@shared/core/utils/catalogItemDraft";
import type { PlanInput } from "@shared/modules/admin/plans/utils/types";

export const MAX_PLAN_DURATION = 12;

export type PlanDraft = PlanInput;

export function planDraftOf(plan: Plan | null, newBranchId: string | null): PlanDraft {
  return {
    name: plan?.name ?? "",
    isCustomPrice: plan?.isCustomPrice ?? false,
    price: plan?.price ?? null,
    currencyId: plan?.currencyId ?? null,
    branchId: plan ? plan.branchId : newBranchId,
    durationMonths: plan?.durationMonths ?? 1,
  };
}

export function isMultiMonthPlan(draft: Pick<PlanDraft, "durationMonths">): boolean {
  return draft.durationMonths > 1;
}

// A plan billed over several months has one bundle price, never a custom one.
export function withPlanDuration(draft: PlanDraft, months: number): PlanDraft {
  const durationMonths = Math.min(MAX_PLAN_DURATION, Math.max(1, months));
  return {
    ...draft,
    durationMonths,
    isCustomPrice: durationMonths > 1 ? false : draft.isCustomPrice,
  };
}

export function canSavePlan(draft: PlanDraft): boolean {
  return draft.name.trim().length > 0 && (draft.isCustomPrice || isPositivePrice(draft.price));
}

export function planInput(draft: PlanDraft): PlanInput {
  return {
    ...draft,
    price: draft.isCustomPrice ? null : draft.price,
    currencyId: draft.isCustomPrice ? null : draft.currencyId,
  };
}
