import type { Plan } from "@shared/core/types";
import { isPositivePrice } from "@shared/core/utils/catalogItemDraft";
import { currentBillingMonth } from "@shared/modules/customer/customer-plans/utils/priceHistory";
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
    usage: plan?.usage ?? null,
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
  if (draft.name.trim().length === 0) return false;
  if (draft.usage) {
    return (
      draft.usage.unitName.trim().length > 0 &&
      draft.usage.feeName.trim().length > 0
    );
  }
  return draft.isCustomPrice || isPositivePrice(draft.price);
}

export function planInput(draft: PlanDraft): PlanInput {
  if (draft.usage) {
    return {
      ...draft,
      price: null,
      isCustomPrice: false,
      durationMonths: 1,
    };
  }
  return {
    ...draft,
    price: draft.isCustomPrice ? null : draft.price,
    currencyId: draft.isCustomPrice ? null : draft.currencyId,
  };
}

export function isPlanFormDirty(
  dirty: boolean,
  priceChanged: boolean,
  customPriceFrom: string | null,
): boolean {
  return (
    dirty ||
    (priceChanged &&
      customPriceFrom !== null &&
      customPriceFrom !== currentBillingMonth())
  );
}
