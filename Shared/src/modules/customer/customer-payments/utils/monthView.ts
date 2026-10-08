import type { Charge, MonthEntry, MonthStatus } from "@shared/core/types";
import type { LinePrice } from "@shared/modules/customer/customer-plans/utils/linePrice";
import {
  isCurrentMonth,
  isPartialMonth,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import type { Tone } from "@shared/shared/lib/tone";

export type MonthCellTone =
  | "paid"
  | "paid_irregular"
  | "unpaid"
  | "unpaid_irregular"
  | "current_unpaid"
  | "future"
  | "before_start"
  | "skipped"
  | "written_off";

// A non-regular customer is never chased, so an empty month stays plain grey.
export function monthCellTone(entry: MonthEntry, isRegular: boolean): MonthCellTone {
  switch (entry.status) {
    case "paid":
      return isRegular ? "paid" : "paid_irregular";
    case "unpaid":
      if (!isRegular) return "unpaid_irregular";
      return isCurrentMonth(entry) ? "current_unpaid" : "unpaid";
    default:
      return entry.status;
  }
}

export function isSelectableMonth(entry: MonthEntry): boolean {
  return entry.status !== "before_start";
}

export type MonthRowStatus = MonthStatus | "partial";

// A write-off outranks the money on the bill, and partial outranks plain paid.
export function monthRowStatus(entry: MonthEntry): MonthRowStatus {
  if (entry.charge?.writtenOffAt) return "written_off";
  if (isPartialMonth(entry)) return "partial";
  return entry.status;
}

const ROW_STATUS_TONE: Record<MonthRowStatus, Tone> = {
  written_off: "orange",
  partial: "amber",
  paid: "emerald",
  unpaid: "red",
  skipped: "sky",
  future: "gray",
  before_start: "gray",
};

export function monthRowStatusTone(status: MonthRowStatus, isRegular: boolean): Tone {
  return status === "unpaid" && !isRegular ? "gray" : ROW_STATUS_TONE[status];
}

export function monthRowEmphasis(entry: MonthEntry): "muted" | "highlighted" | null {
  if (entry.status === "before_start") return "muted";
  return isCurrentMonth(entry) ? "highlighted" : null;
}

// Money reached the month: the bill's own figures, never the line's price.
export function hasMonthMoney(entry: MonthEntry): boolean {
  return entry.collected > 0 || !!entry.charge?.writtenOffAt;
}

export type MonthBillFigure =
  | { from: "bill"; charge: Charge }
  | { from: "line"; amount: number; currencyId: string | null };

// A bundle's money sits on its first month; unpaid shows a 1-month fixed price.
export function monthBillFigure(entry: MonthEntry, linePrice: LinePrice): MonthBillFigure | null {
  if (entry.isGroupSecondary) return null;
  if (entry.charge && hasMonthMoney(entry)) return { from: "bill", charge: entry.charge };
  const due = entry.status === "unpaid" || entry.status === "future";
  if (!due || !linePrice.isFixed || linePrice.durationMonths > 1 || linePrice.amount === null) {
    return null;
  }
  return { from: "line", amount: linePrice.amount, currencyId: linePrice.currencyId };
}

export function monthPaidFigure(entry: MonthEntry): { charge: Charge; amount: number } | null {
  if (entry.isGroupSecondary || !entry.charge || entry.collected <= 0) return null;
  return { charge: entry.charge, amount: entry.collected };
}

export function monthOwedFigure(entry: MonthEntry): { charge: Charge; amount: number } | null {
  const { charge, balance } = entry;
  if (entry.isGroupSecondary || !charge || charge.writtenOffAt) return null;
  if (entry.collected <= 0 || balance <= 0) return null;
  return { charge, amount: balance };
}

export type MonthNote =
  | { kind: "covers" | "in_bill"; startMonth: string; durationMonths: number }
  | { kind: "skip"; note: string }
  | null;

export function monthNoteOf(entry: MonthEntry): MonthNote {
  const charge = entry.charge;
  if (charge && entry.collected > 0 && charge.durationMonths > 1) {
    return {
      kind: entry.isGroupSecondary ? "in_bill" : "covers",
      startMonth: charge.billingMonth ?? entry.billingMonth,
      durationMonths: charge.durationMonths,
    };
  }
  return entry.skip?.note ? { kind: "skip", note: entry.skip.note } : null;
}
