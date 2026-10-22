import type { Customer, Plan, PlanUsage } from "@shared/core/types";
import type { LineDraft } from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import {
  linePriceChanged,
  type LinePriceFields,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import {
  canBePrepaid,
  prepaidStartDate,
  withPrepaidStart,
} from "@shared/modules/customer/customer-plans/utils/prepaidLine";

// `id` = a saved line; "cancelled" rows stay read-only until reactivated.
export interface LineRow {
  key: string;
  id?: string;
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
  meterNumber: string;
  startReading: number | null;
  prepaid: boolean;
  status: "active" | "cancelled";
  priceFrom?: string;
  savedPlan?: LinePlan | null;
}

type LinePlan = Pick<Plan, "id" | "usage" | "prepaid">;

export function newLineRow(suffix: number, startDate: string): LineRow {
  return {
    key: `new-${suffix}`,
    planId: null,
    startDate,
    customPrice: null,
    customCurrencyId: null,
    meterNumber: "",
    startReading: null,
    prepaid: false,
    status: "active",
  };
}

// A new customer starts with one blank line dated today.
export function rowsFromCustomer(
  customer: Pick<Customer, "customerPlans"> | null | undefined,
  today: string,
): LineRow[] {
  const lines = customer?.customerPlans ?? [];
  if (lines.length === 0) return [newLineRow(0, today)];
  return lines.map((line) => ({
    key: line.id,
    id: line.id,
    planId: line.planId,
    startDate: line.startDate,
    customPrice: line.customPrice,
    customCurrencyId: line.customCurrencyId,
    meterNumber: line.meterNumber ?? "",
    startReading: line.startReading,
    prepaid: line.prepaid,
    status: line.active ? "active" : "cancelled",
    savedPlan: line.plan
      ? { id: line.plan.id, usage: line.plan.usage, prepaid: line.plan.prepaid }
      : null,
  }));
}

// The common case is a second service beginning alongside the first.
export function nextLineStartDate(rows: LineRow[], today: string): string {
  return rows[rows.length - 1]?.startDate ?? today;
}

// Picking a plan brings its prepaid default; a prepaid row starts on the 1st.
export function withRowPlan(
  row: LineRow,
  planId: string | null,
  plans: readonly LinePlan[],
): LineRow {
  const plan = plans.find((p) => p.id === planId);
  const prepaid = plan ? canBePrepaid(plan.usage) && plan.prepaid : row.prepaid;
  return withRowPrepaid({ ...row, planId }, prepaid);
}

export function withRowPrepaid(row: LineRow, prepaid: boolean): LineRow {
  return prepaid
    ? { ...row, prepaid, startDate: prepaidStartDate(row.startDate) }
    : { ...row, prepaid };
}

export function withRowStartDate(row: LineRow, startDate: string): LineRow {
  return { ...row, startDate: row.prepaid ? prepaidStartDate(startDate) : startDate };
}

// The switch shows only where a line can be prepaid (never a meter line).
export function canRowBePrepaid(row: LineRow, plans: readonly LinePlan[]): boolean {
  return canBePrepaid(planUsageOf(row, plans));
}

// A plan-price row keeps no currency; a zero special price means "none".
function specialPriceOf(row: LineRow): LinePriceFields {
  const special = row.customPrice !== null && row.customPrice > 0;
  return {
    customPrice: special ? row.customPrice : null,
    customCurrencyId: special ? row.customCurrencyId : null,
  };
}

// The row's own saved plan answers when the loaded plan list lacks it.
function planUsageOf(row: LineRow, plans: readonly LinePlan[]): PlanUsage | null {
  const listed = plans.find((p) => p.id === row.planId);
  if (listed) return listed.usage;
  return row.savedPlan?.id === row.planId ? row.savedPlan.usage : null;
}

// A usage line is priced each month, so it never keeps a special price.
export function toLineDrafts(rows: LineRow[], plans: readonly LinePlan[]): LineDraft[] {
  return rows
    .filter((row) => row.status === "active")
    .map((row) => {
      const usagePlan = planUsageOf(row, plans);
      const meter = usagePlan?.entry === "reading";
      const usage = usagePlan !== null;
      return withPrepaidStart({
        id: row.id,
        planId: row.planId,
        startDate: row.startDate,
        prepaid: canBePrepaid(usagePlan) && row.prepaid,
        ...(usage ? { customPrice: null, customCurrencyId: null } : specialPriceOf(row)),
        meterNumber: meter ? row.meterNumber.trim() || null : null,
        startReading: meter ? row.startReading : null,
        priceFrom: row.priceFrom,
      });
    });
}

// Only a saved special price has a history; a plan switch never asks — #185.
export function rowPriceChanged(initial: readonly LineRow[], row: LineRow): boolean {
  const saved = row.id ? initial.find((r) => r.key === row.key) : undefined;
  if (!saved || saved.status !== "active" || row.status !== "active") return false;
  return linePriceChanged(specialPriceOf(saved), specialPriceOf(row));
}

// A branch change drops plans owned by another branch; `cleared` keeps it clean.
export function clearOtherBranchPlans(
  rows: LineRow[],
  plans: Pick<Plan, "id" | "branchId">[],
  branchId: string | null,
): { rows: LineRow[]; cleared: string[] } {
  const cleared: string[] = [];
  const next = rows.map((row) => {
    if (row.status !== "active" || !row.planId) return row;
    const plan = plans.find((p) => p.id === row.planId);
    if (!plan || plan.branchId === null || plan.branchId === branchId) return row;
    cleared.push(row.key);
    return { ...row, planId: null };
  });
  return { rows: cleared.length > 0 ? next : rows, cleared };
}

// A plan the form cleared by itself is not a change the user made.
export function lineRowsChanged(
  initial: LineRow[],
  rows: LineRow[],
  autoCleared: readonly string[],
): boolean {
  if (rows.length !== initial.length) return true;
  return rows.some((row, i) => {
    const base = initial[i];
    return (
      base.key !== row.key ||
      (base.planId !== row.planId && !autoCleared.includes(row.key)) ||
      base.startDate !== row.startDate ||
      base.customPrice !== row.customPrice ||
      base.meterNumber !== row.meterNumber ||
      base.startReading !== row.startReading ||
      base.prepaid !== row.prepaid ||
      (row.customPrice !== null && base.customCurrencyId !== row.customCurrencyId) ||
      base.status !== row.status
    );
  });
}
