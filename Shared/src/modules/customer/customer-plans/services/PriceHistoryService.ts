import i18n from "@shared/core/i18n";
import { repositories } from "@shared/core/runtime/repositories";
import type { CustomerPlan, Plan, PlanPriceChange, PriceHistory } from "@shared/core/types";
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
  canEditPriceStart,
  isPriceStartMonth,
  priceHistoryOf,
  type LinePriceFields,
  type PlanPriceFields,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";

const ID_BATCH_SIZE = 200;

export interface UsageMonthPriceInput {
  plan: Plan;
  unitPrice: number;
  fixedFee: number;
}

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
    fixed_fee: null,
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

  async getForPlan(planId: string): Promise<PlanPriceChange[]> {
    if (!planId) return [];
    const rows = await repositories().priceHistory.findPlanChanges([planId]);
    return rows.map(mapDbPlanPriceChange);
  }

  async updatePlanChangeFromMonth(
    id: string,
    planId: string,
    fromMonth: string,
  ): Promise<PlanPriceChange> {
    const changes = await this.getForPlan(planId);
    const match = changes.find((c) => c.id === id);
    if (!match) throw new Error(i18n.t("errors.price_change_not_found"));
    if (!canEditPriceStart(match, changes)) {
      throw new Error(i18n.t("errors.price_change_not_editable"));
    }
    this.assertStartMonth(fromMonth);
    if (match.fromMonth === fromMonth) return match;
    const row = await repositories().priceHistory.updatePlanChangeFromMonth(
      id,
      planId,
      fromMonth,
      match.fromMonth,
    );
    return mapDbPlanPriceChange(row);
  }

  async planChangePayloads(
    previous: Plan,
    next: PlanPriceFields,
    fromMonth: string,
  ): Promise<{ first: PlanPriceChangePayload; change: PlanPriceChangePayload }> {
    const createdAt = nowIso();
    const row = (id: string, month: string | null, fields: PlanPriceFields): PlanPriceChangePayload => ({
      id,
      tenant_id: previous.tenantId,
      plan_id: previous.id,
      from_month: month,
      ...planFields(fields),
      created_at: createdAt,
    });
    return {
      first: row(await deterministicId("plan-price", previous.id), null, previous),
      change: row(newId(), fromMonth, next),
    };
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

  // One write prices `month` on every given usage plan; a later row for the month wins.
  async setUsageMonthPrices(
    month: string,
    prices: UsageMonthPriceInput[],
  ): Promise<PlanPriceChange[]> {
    if (prices.length === 0) return [];
    if (!isPriceStartMonth(month)) throw new Error(i18n.t("errors.usage_price_month"));
    for (const { plan, unitPrice, fixedFee } of prices) {
      if (!plan.usage) throw new Error(i18n.t("errors.usage_price_fixed_plan"));
      if (!(Number.isFinite(unitPrice) && unitPrice > 0)) {
        throw new Error(i18n.t("errors.usage_unit_price_positive"));
      }
      if (!(Number.isFinite(fixedFee) && fixedFee >= 0)) {
        throw new Error(i18n.t("errors.usage_fixed_fee_not_negative"));
      }
    }
    const createdAt = nowIso();
    const rows = await repositories().priceHistory.addMonthPrices(
      prices.map(({ plan, unitPrice, fixedFee }) => ({
        id: newId(),
        tenant_id: plan.tenantId,
        plan_id: plan.id,
        from_month: month,
        price: unitPrice,
        currency_id: plan.currencyId,
        duration_months: 1,
        is_custom_price: false,
        fixed_fee: fixedFee,
        created_at: createdAt,
      })),
    );
    return rows.map(mapDbPlanPriceChange);
  }

  private assertStartMonth(month: string): void {
    if (!isPriceStartMonth(month)) throw new Error(i18n.t("errors.price_start_month"));
  }
}

export const priceHistoryService = new PriceHistoryService();
