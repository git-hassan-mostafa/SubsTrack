import type { DbPlanPriceChange } from "@shared/core/types/db";

type MonthPriceRow = Pick<
  DbPlanPriceChange,
  "plan_id" | "from_month" | "price" | "fixed_fee" | "currency_id" | "created_at"
>;

// What a usage month price says, as the plan's audit trail stores it.
export function monthPriceAuditFields(
  name: string | null,
  row: Omit<MonthPriceRow, "plan_id" | "created_at"> | null,
) {
  return {
    name,
    price_month: row?.from_month ?? null,
    unit_price: row?.price ?? null,
    fixed_fee: row?.fixed_fee ?? null,
    currency_id: row?.currency_id ?? null,
  };
}

// The newest row each plan holds for `month` — the price a new row replaces.
export function latestMonthPrices<R extends MonthPriceRow>(
  rows: R[],
  month: string,
): Map<string, R> {
  const latest = new Map<string, R>();
  for (const row of rows) {
    if (row.from_month?.slice(0, 10) !== month) continue;
    const held = latest.get(row.plan_id);
    if (!held || row.created_at > held.created_at) latest.set(row.plan_id, row);
  }
  return latest;
}
