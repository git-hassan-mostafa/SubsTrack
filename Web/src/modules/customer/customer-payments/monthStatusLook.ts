import type { MonthEntry } from "@shared/core/types";
import {
  monthRowStatus,
  monthRowStatusTone,
} from "@shared/modules/customer/customer-payments/utils/monthView";
import type { ChipTone } from "@/shared/components/chipTones";

export interface MonthStatusLook {
  labelKey: string;
  tone: ChipTone;
}

export function monthStatusLook(entry: MonthEntry, isRegular: boolean): MonthStatusLook {
  const status = monthRowStatus(entry);
  return {
    labelKey: `web.month_grid.status_${status}`,
    tone: monthRowStatusTone(status, isRegular),
  };
}
