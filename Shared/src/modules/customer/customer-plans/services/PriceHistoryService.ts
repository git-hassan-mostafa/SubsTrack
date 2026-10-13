import i18n from "@shared/core/i18n";
import { repositories } from "@shared/core/runtime/repositories";
import type { CustomerPlan, Plan, PriceHistory } from "@shared/core/types";
import { inChunks } from "@shared/core/utils/chunk";
import { deterministicId, newId, nowIso } from "@shared/core/utils/ids";
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
    custom_price: fields.customPrice,
    custom_currency_id: fields.customPrice === null ? null : fields.customCurrencyId,
  };
}

class PriceHistoryService {
  async getForLines(lines: Pick<CustomerPlan, "id" | "planId">[]): Promise<PriceHistory> {
    if (lines.length === 0) return EMPTY_PRICE_HISTORY;
    const repo = repositories().priceHistory;
    const planIds = [
      ...new Set(lines.map((l) => l.planId).filter((id): id is string => !!id)),
    ];
    const [lineChanges, planChanges] = await Promise.all([
      readInChunks(
        lines.map((l) => l.id),
        (ids) => repo.findLineChanges(ids),
      ),
      readInChunks(planIds, (ids) => repo.findPlanChanges(ids)),
    ]);
    return priceHistoryOf({
      lineChanges: lineChanges.map(mapDbLinePriceChange),
      planChanges: planChanges.map(mapDbPlanPriceChange),
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
