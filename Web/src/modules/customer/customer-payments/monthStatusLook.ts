import type { MonthEntry } from "@shared/core/types";
import { isPartialMonth } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import type { ChipTone } from "@/shared/components/chipTones";

export interface MonthStatusLook {
  labelKey: string;
  tone: ChipTone;
}

// A non-regular customer is never chased, so an empty month is grey, not red.
export function monthStatusLook(entry: MonthEntry, isRegular: boolean): MonthStatusLook {
  if (entry.charge?.writtenOffAt) return { labelKey: "web.month_grid.status_written_off", tone: "orange" };
  if (isPartialMonth(entry)) return { labelKey: "web.month_grid.status_partial", tone: "amber" };
  switch (entry.status) {
    case "paid":
      return { labelKey: "web.month_grid.status_paid", tone: "emerald" };
    case "unpaid":
      return { labelKey: "web.month_grid.status_unpaid", tone: isRegular ? "red" : "gray" };
    case "skipped":
      return { labelKey: "web.month_grid.status_skipped", tone: "sky" };
    case "future":
      return { labelKey: "web.month_grid.status_future", tone: "gray" };
    case "before_start":
      return { labelKey: "web.month_grid.status_before_start", tone: "gray" };
  }
}
