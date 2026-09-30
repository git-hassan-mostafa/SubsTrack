import type { Customer, Plan } from "@shared/core/types";
import type { LineDraft } from "@shared/modules/customer/customer-plans/services/CustomerPlanService";

// `id` = a saved line; "cancelled" rows stay read-only until reactivated.
export interface LineRow {
  key: string;
  id?: string;
  planId: string | null;
  startDate: string;
  customPrice: number | null;
  customCurrencyId: string | null;
  status: "active" | "cancelled";
}

export function newLineRow(suffix: number, startDate: string): LineRow {
  return {
    key: `new-${suffix}`,
    planId: null,
    startDate,
    customPrice: null,
    customCurrencyId: null,
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
    status: line.active ? "active" : "cancelled",
  }));
}

// The common case is a second service beginning alongside the first.
export function nextLineStartDate(rows: LineRow[], today: string): string {
  return rows[rows.length - 1]?.startDate ?? today;
}

// A plan-price row keeps no currency; a zero special price means "none".
export function toLineDrafts(rows: LineRow[]): LineDraft[] {
  return rows
    .filter((row) => row.status === "active")
    .map((row) => {
      const special = row.customPrice !== null && row.customPrice > 0;
      return {
        id: row.id,
        planId: row.planId,
        startDate: row.startDate,
        customPrice: special ? row.customPrice : null,
        customCurrencyId: special ? row.customCurrencyId : null,
      };
    });
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
      (row.customPrice !== null && base.customCurrencyId !== row.customCurrencyId) ||
      base.status !== row.status
    );
  });
}
