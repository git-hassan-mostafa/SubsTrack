import type { MonthEntry } from "@shared/core/types";
import { showsPartialRing } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { monthCellTone, type MonthCellTone } from "@shared/modules/customer/customer-payments/utils/monthView";

export interface MonthCellLook {
  bg: string;
  fg: string;
  ring: string | null;
}

// The phone's cell colours, one shade darker so the month name stays readable.
const TONE_LOOK: Record<MonthCellTone, MonthCellLook> = {
  paid: { bg: "#16a34a", fg: "#ffffff", ring: null },
  paid_irregular: { bg: "#facc15", fg: "#713f12", ring: null },
  unpaid: { bg: "#dc2626", fg: "#ffffff", ring: null },
  unpaid_irregular: { bg: "#e5e7eb", fg: "#6b7280", ring: null },
  current_unpaid: { bg: "#fee2e2", fg: "#b91c1c", ring: "#dc2626" },
  future: { bg: "#f3f4f6", fg: "#6b7280", ring: null },
  before_start: { bg: "#f3f4f6", fg: "#9ca3af", ring: null },
  skipped: { bg: "#6b7280", fg: "#ffffff", ring: null },
};

const PARTIAL_RING = "#f59e0b";

export function monthCellLook(entry: MonthEntry, isRegular: boolean): MonthCellLook {
  const look = TONE_LOOK[monthCellTone(entry, isRegular)];
  return showsPartialRing(entry) ? { ...look, ring: PARTIAL_RING } : look;
}
