import i18n from "@shared/core/i18n";
import { repositories } from "@shared/core/runtime/repositories";
import type {
  CustomerPlan,
  LineUsage,
  MeterChange,
  PriceHistory,
  UsageEntry,
  UsageReading,
} from "@shared/core/types";
import { inChunks } from "@shared/core/utils/chunk";
import { nowIso } from "@shared/core/utils/ids";
import { mapDbUsageReading } from "@shared/modules/customer/customer-payments/utils/mapper";
import { paidBillingMonths } from "@shared/modules/customer/customer-payments/utils/monthStatus";
import {
  isReadingLocked,
  usageByLineOf,
  type UsageSourceLine,
} from "@shared/modules/customer/customer-payments/utils/usageBill";
import { priceHistoryService } from "@shared/modules/customer/customer-plans/services/PriceHistoryService";
import { currentBillingMonth } from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";

const ID_BATCH_SIZE = 200;

export interface SaveUsageInput {
  line: Pick<CustomerPlan, "id" | "customerId" | "tenantId" | "startDate" | "plan">;
  billingMonth: string;
  value: number;
  meterChange: MeterChange | null;
  recordedByUserId: string | null;
}

const isAmount = (n: number) => Number.isFinite(n) && n >= 0;

class UsageReadingService {
  async getForLines(lineIds: string[]): Promise<UsageReading[]> {
    if (lineIds.length === 0) return [];
    const repo = repositories().usageReading;
    const rows = (
      await Promise.all(
        inChunks(lineIds, ID_BATCH_SIZE).map((ids) => repo.findForLines(ids)),
      )
    ).flat();
    return rows.map(mapDbUsageReading);
  }

  // What the month rules need for usage lines; fixed lines are left out.
  async getUsageByLine(
    lines: UsageSourceLine[],
    prices?: PriceHistory,
  ): Promise<Map<string, LineUsage>> {
    const usageLines = lines.filter((l) => l.plan?.usage);
    if (usageLines.length === 0) return new Map();
    const [readings, history] = await Promise.all([
      this.getForLines(usageLines.map((l) => l.id)),
      prices ?? priceHistoryService.getForLines(usageLines),
    ]);
    return usageByLineOf(usageLines, readings, history);
  }

  // A fix keeps the first save's time and author — the bill's day counts from it.
  async save(input: SaveUsageInput): Promise<UsageReading> {
    const usage = input.line.plan?.usage;
    if (!usage) throw new Error(i18n.t("errors.usage_line_not_usage"));
    this.assertMonth(input.line.startDate, input.billingMonth);
    if (!isAmount(input.value)) throw new Error(i18n.t("errors.usage_value_invalid"));
    const change = usage.entry === "reading" ? input.meterChange : null;
    if (
      change &&
      !(isAmount(change.oldMeterFinal) && isAmount(change.newMeterStart))
    ) {
      throw new Error(i18n.t("errors.usage_value_invalid"));
    }
    await this.assertUnlocked(input.line.id, usage.entry, input.billingMonth);
    const existing = (await this.getForLines([input.line.id])).find(
      (r) => r.billingMonth === input.billingMonth,
    );
    const row = await repositories().usageReading.save({
      tenant_id: input.line.tenantId,
      customer_id: input.line.customerId,
      customer_plan_id: input.line.id,
      billing_month: input.billingMonth,
      reading: usage.entry === "reading" ? input.value : null,
      units: usage.entry === "direct" ? input.value : null,
      old_meter_final: change?.oldMeterFinal ?? null,
      new_meter_start: change?.newMeterStart ?? null,
      new_meter_number: change?.newMeterNumber?.trim() || null,
      recorded_by_user_id: existing?.recordedByUserId ?? input.recordedByUserId,
      recorded_at: existing?.recordedAt ?? nowIso(),
    });
    return mapDbUsageReading(row);
  }

  async remove(reading: UsageReading, voidedBy: string): Promise<void> {
    const entry: UsageEntry = reading.reading !== null ? "reading" : "direct";
    await this.assertUnlocked(reading.customerPlanId, entry, reading.billingMonth);
    await repositories().usageReading.remove(reading.id, voidedBy);
  }

  // Money on the month (by meter, on the next one too) froze the units it paid for.
  private async assertUnlocked(
    lineId: string,
    entry: UsageEntry,
    billingMonth: string,
  ): Promise<void> {
    const bills = (await chargeService.getMonthBillsForLines([lineId])).get(lineId) ?? [];
    if (!isReadingLocked(entry, billingMonth, paidBillingMonths(bills))) return;
    throw new Error(
      i18n.t(
        entry === "reading"
          ? "errors.usage_reading_locked_paid"
          : "errors.usage_units_locked_paid",
      ),
    );
  }

  private assertMonth(startDate: string, billingMonth: string): void {
    if (!/^\d{4}-\d{2}-01$/.test(billingMonth)) {
      throw new Error(i18n.t("errors.billing_month_format"));
    }
    if (billingMonth < `${startDate.slice(0, 7)}-01`) {
      throw new Error(i18n.t("errors.usage_before_start"));
    }
    if (billingMonth > currentBillingMonth()) {
      throw new Error(i18n.t("errors.usage_future_month"));
    }
  }
}

export const usageReadingService = new UsageReadingService();
