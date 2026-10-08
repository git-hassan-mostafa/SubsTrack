import i18n from "@shared/core/i18n";
import { repositories } from "@shared/core/runtime/repositories";
import type { CustomerPlan, Plan, PriceHistory } from "@shared/core/types";
import { inChunks } from "@shared/core/utils/chunk";
import { deterministicId, newId, nowIso } from "@shared/core/utils/ids";
import { mapDbPlanToPlan } from "@shared/modules/admin/plans/utils/mapper";
import type {
  LinePriceChangePayload,
  PlanPriceChangePayload,
} from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";
import {
  mapDbLinePriceChange,
  mapDbPlanPriceChange,
} from "@shared/modules/customer/customer-plans/utils/mapper";
import {
  EMPTY_PRICE_HISTORY,
  isPriceStartMonth,
  priceHistoryOf,
  type LinePriceFields,
  type PlanPriceFields,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

const ID_BATCH_SIZE = 200;

async function readInChunks<R>(
  ids: string[],
  read: (chunk: string[]) => Promise<R[]>,
): Promise<R[]> {
  if (ids.length === 0) return [];
  return (await Promise.all(inChunks(ids, ID_BATCH_SIZE).map(read))).flat();
}

function planFields(fields: PlanPriceFields) {
  return {
    price: fields.isCustomPrice ? null : fields.price,
    currency_id: fields.isCustomPrice ? null : fields.currencyId,
    duration_months: fields.durationMonths,
    is_custom_price: fields.isCustomPrice,
  };
}

function lineFields(fields: LinePriceFields) {
  return {
    plan_id: fields.planId,
    custom_price: fields.customPrice,
    custom_currency_id: fields.customPrice === null ? null : fields.customCurrencyId,
  };
}

class PriceHistoryService {
  // Every edit reaching these lines, plus the plans a line has since left.
  async getForLines(lines: Pick<CustomerPlan, "id" | "planId">[]): Promise<PriceHistory> {
    if (lines.length === 0) return EMPTY_PRICE_HISTORY;
    const repo = repositories().priceHistory;
    const lineChanges = (
      await readInChunks(
        lines.map((l) => l.id),
        (ids) => repo.findLineChanges(ids),
      )
    ).map(mapDbLinePriceChange);
    const current = new Set(lines.map((l) => l.planId).filter((id): id is string => !!id));
    const left = [
      ...new Set(
        lineChanges
          .map((c) => c.planId)
          .filter((id): id is string => !!id && !current.has(id)),
      ),
    ];
    const [planChanges, leftPlans] = await Promise.all([
      readInChunks([...current, ...left], (ids) => repo.findPlanChanges(ids)),
      readInChunks(left, (ids) => repositories().plan.findByIds(ids)),
    ]);
    return priceHistoryOf({
      lineChanges,
      planChanges: planChanges.map(mapDbPlanPriceChange),
      plans: leftPlans.map(mapDbPlanToPlan),
    });
  }

  // Run BEFORE the plan row moves: a failed save then changes no month — #185.
  async recordPlanChange(
    previous: Plan,
    next: PlanPriceFields,
    fromMonth: string,
  ): Promise<void> {
    this.assertStartMonth(fromMonth);
    const createdAt = nowIso();
    const row = (id: string, month: string | null, fields: PlanPriceFields): PlanPriceChangePayload => ({
      id,
      tenant_id: previous.tenantId,
      plan_id: previous.id,
      from_month: month,
      ...planFields(fields),
      created_at: createdAt,
    });
    await repositories().priceHistory.addPlanChange(
      row(await deterministicId("plan-price", previous.id), null, previous),
      row(newId(), fromMonth, next),
    );
  }

  async recordLineChange(
    previous: CustomerPlan,
    next: LinePriceFields,
    fromMonth: string,
  ): Promise<void> {
    this.assertStartMonth(fromMonth);
    const createdAt = nowIso();
    const row = (id: string, month: string | null, fields: LinePriceFields): LinePriceChangePayload => ({
      id,
      tenant_id: previous.tenantId,
      customer_id: previous.customerId,
      customer_plan_id: previous.id,
      from_month: month,
      ...lineFields(fields),
      created_at: createdAt,
    });
    await repositories().priceHistory.addLineChange(
      row(await deterministicId("line-price", previous.id), null, previous),
      row(newId(), fromMonth, next),
    );
  }

  private assertStartMonth(month: string): void {
    if (!isPriceStartMonth(month)) throw new Error(i18n.t("errors.price_start_month"));
  }
}

export const priceHistoryService = new PriceHistoryService();
