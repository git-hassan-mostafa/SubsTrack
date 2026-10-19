import type { TFunction } from "i18next";
import type { Currency, PlanUsage, UsageBill, UsageWait } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import type { ReadingPreview } from "@shared/modules/customer/customer-payments/utils/meterReadingForm";

export interface ReadingText {
  title: string;
  valueLabel: string;
  previous: string | null;
  units: string | null;
  bill: string | null;
  note: string | null;
  warnings: string[];
  locked: string;
}

const unitNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

export function formatUnits(units: number, unitName: string): string {
  return `${unitNumber.format(units)} ${unitName}`;
}

// A usage bill stays in its plan's currency, never converted.
export function usageBillLine(
  bill: UsageBill,
  usage: PlanUsage,
  currencies: Currency[],
  t: TFunction,
): string {
  const currency = findCurrency(currencies, bill.currencyId);
  const money = (amount: number) => formatMoney(amount, currency, currency);
  return t("payments.reading.bill_line", {
    feeName: usage.feeName,
    fee: money(bill.fixedFee),
    units: unitNumber.format(bill.units),
    unitPrice: money(bill.unitPrice),
    amount: money(bill.amount),
  });
}

function waitNote(
  waitingFor: UsageWait,
  billingMonth: string,
  isStartMonth: boolean,
  t: TFunction,
): string | null {
  switch (waitingFor) {
    case "price":
      return t("payments.reading.waiting_price", { month: billingMonthLabel(billingMonth) });
    case "previous_reading":
      return t(
        isStartMonth
          ? "payments.reading.waiting_start_reading"
          : "payments.reading.waiting_previous_reading",
      );
    default:
      return null;
  }
}

export function readingText(
  preview: ReadingPreview,
  usage: PlanUsage,
  billingMonth: string,
  isStartMonth: boolean,
  currencies: Currency[],
  t: TFunction,
): ReadingText {
  const meter = usage.entry === "reading";
  const month = billingMonthLabel(billingMonth);
  const warnings = preview.warnings.map((warning) =>
    warning === "below_previous"
      ? t("payments.reading.warn_below_previous", {
          previous: unitNumber.format(preview.previousReading ?? 0),
        })
      : t("payments.reading.warn_high_usage", {
          usual: formatUnits(Math.round(preview.usualUnits ?? 0), usage.unitName),
        }),
  );
  return {
    title: t(meter ? "payments.reading.title_reading" : "payments.reading.title_units", { month }),
    valueLabel: meter
      ? t("payments.reading.value_reading")
      : t("payments.reading.value_units", { unit: usage.unitName }),
    previous: !meter
      ? null
      : preview.previousReading === null
        ? t("payments.reading.no_previous")
        : unitNumber.format(preview.previousReading),
    units: preview.units === null ? null : formatUnits(preview.units, usage.unitName),
    bill:
      preview.month?.kind === "bill"
        ? usageBillLine(preview.month.bill, usage, currencies, t)
        : null,
    note:
      preview.month?.kind === "waiting"
        ? waitNote(preview.month.waitingFor, billingMonth, isStartMonth, t)
        : null,
    warnings,
    locked: t(meter ? "payments.reading.locked_reading" : "payments.reading.locked_units"),
  };
}
