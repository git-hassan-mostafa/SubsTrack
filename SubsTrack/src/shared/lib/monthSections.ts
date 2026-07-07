import type { TFunction } from "i18next";
import { MONTHS } from "@/src/core/constants";
import { getCurrentYearMonth } from "@/src/core/utils/date";

// A section of a transaction list: one calendar month of rows, newest month first.
// `key` is `YYYY-MM`; `title` is the localized header ("This Month" / "June 2026").
// `totalUsd` is the sum of the section's rows (via `getAmountUsd`), or undefined
// when the caller didn't ask for a total.
export interface MonthSection<T> {
  key: string;
  title: string;
  data: T[];
  totalUsd?: number;
}

// Parse the year+month out of any ISO-ish date string (YYYY-MM-DD, YYYY-MM-01,
// or a full timestamp). We only need the leading year and month, so a plain
// split is enough and avoids Date timezone drift.
function yearMonthOf(iso: string): { year: number; month: number } {
  const [year, month] = iso.split(/[-T]/).map(Number);
  return { year, month };
}

// Localized month header. The current calendar month renders as "This Month";
// every other month renders as "<Month> <Year>" (e.g. "June 2026").
function sectionTitle(
  year: number,
  month: number,
  t: TFunction,
  current: { year: number; month: number },
): string {
  if (year === current.year && month === current.month) {
    return t("common.current_month");
  }
  const name = t(`months_long.${MONTHS[month - 1]}`);
  return `${name} ${year}`;
}

// Group an already date-desc-sorted list into month sections (newest month
// first). Rows keep their incoming order within a section, so the caller stays
// the single source of sort order — this only buckets. `getDate` returns the
// row's ISO date string used for grouping. `getAmountUsd`, when passed, sums
// each row's USD-equivalent amount into `totalUsd` for the section header.
export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => string,
  t: TFunction,
  getAmountUsd?: (item: T) => number,
): MonthSection<T>[] {
  const current = getCurrentYearMonth();
  const sections: MonthSection<T>[] = [];
  let currentKey: string | null = null;

  for (const item of items) {
    const { year, month } = yearMonthOf(getDate(item));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key !== currentKey) {
      sections.push({
        key,
        title: sectionTitle(year, month, t, current),
        data: [],
        totalUsd: getAmountUsd ? 0 : undefined,
      });
      currentKey = key;
    }
    const section = sections[sections.length - 1];
    section.data.push(item);
    if (getAmountUsd) section.totalUsd = (section.totalUsd ?? 0) + getAmountUsd(item);
  }

  return sections;
}
