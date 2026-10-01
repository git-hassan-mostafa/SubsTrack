import type { MonthEntry, MonthStatus } from "@shared/core/types";
import {
  isCurrentMonth,
  showsPartialRing,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";

export interface MonthCellLook {
  bg: string;
  fg: string;
  ring: string | null;
}

type Fill = Omit<MonthCellLook, "ring">;

// The phone's cell colours, one shade darker so the month name stays readable.
const REGULAR: Record<MonthStatus, Fill> = {
  paid: { bg: "#16a34a", fg: "#ffffff" },
  unpaid: { bg: "#dc2626", fg: "#ffffff" },
  future: { bg: "#f3f4f6", fg: "#6b7280" },
  before_start: { bg: "#f3f4f6", fg: "#9ca3af" },
  skipped: { bg: "#6b7280", fg: "#ffffff" },
};

// A non-regular customer is never chased, so an empty month stays plain grey.
const NON_REGULAR: Record<MonthStatus, Fill> = {
  paid: { bg: "#facc15", fg: "#713f12" },
  unpaid: { bg: "#e5e7eb", fg: "#6b7280" },
  future: { bg: "#f3f4f6", fg: "#6b7280" },
  before_start: { bg: "#f3f4f6", fg: "#9ca3af" },
  skipped: { bg: "#6b7280", fg: "#ffffff" },
};

const CURRENT_UNPAID: MonthCellLook = { bg: "#fee2e2", fg: "#b91c1c", ring: "#dc2626" };
const PARTIAL_RING = "#f59e0b";

export function monthCellLook(entry: MonthEntry, isRegular: boolean): MonthCellLook {
  if (isRegular && entry.status === "unpaid" && isCurrentMonth(entry)) return CURRENT_UNPAID;
  const fill = (isRegular ? REGULAR : NON_REGULAR)[entry.status];
  return { ...fill, ring: showsPartialRing(entry) ? PARTIAL_RING : null };
}
