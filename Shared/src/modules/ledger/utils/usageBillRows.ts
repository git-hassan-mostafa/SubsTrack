import type { ChargeUsage, PlanUsage } from "@shared/core/types";
import {
  formatReading,
  formatUnits,
} from "@shared/modules/customer/customer-payments/utils/meterReadingText";

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface UsageBillRow {
  label: string;
  value: string | null;
}

export function usageReadingsValue(usage: ChargeUsage): string | null {
  if (usage.reading === null) return null;
  const reading = formatReading(usage.reading);
  return usage.previousReading === null
    ? reading
    : `${formatReading(usage.previousReading)} → ${reading}`;
}

// A usage bill's parts in its OWN currency; empty values are dropped by the view.
export function usageBillRows(
  usage: ChargeUsage,
  amount: number,
  planUsage: Pick<PlanUsage, "unitName" | "feeName"> | null,
  money: (value: number) => string,
  t: Translate,
): UsageBillRow[] {
  const unit = planUsage?.unitName ?? t("ledger.usage_unit");
  return [
    { label: t("ledger.usage_readings"), value: usageReadingsValue(usage) },
    { label: t("payments.reading.units"), value: formatUnits(usage.units, unit) },
    { label: t("plans.unit_price_label", { unit }), value: money(usage.unitPrice) },
    {
      label: planUsage?.feeName ?? t("payments.reading.fee"),
      value: usage.fixedFee > 0 ? money(usage.fixedFee) : null,
    },
    {
      label: t("ledger.usage_worked_out_changed"),
      value: amount !== usage.computedAmount ? money(usage.computedAmount) : null,
    },
  ];
}
