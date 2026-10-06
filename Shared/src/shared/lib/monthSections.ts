import type { TFunction } from "i18next";
import { MONTHS } from "@shared/core/constants";
import {
  getCurrentYearMonth,
  getTodayDateString,
  localDayKey,
  localMonthKey,
} from "@shared/core/utils/date";
import { toDay } from "@shared/core/utils/dateRange";

// A section of a transaction list. Most sections are one calendar month
// (`key` = `YYYY-MM`), but the two newest buckets are day/week-scoped:
// `key` = "today" / "this-week". `title` is the localized header
// ("Today" / "This Week" / "This Month" / "June 2026"). `totalUsd` is the sum
// of the section's rows (via `getAmountUsd`), or undefined when not requested.
export interface MonthSection<T> {
  key: string;
  title: string;
  data: T[];
  totalUsd?: number;
}

// The local day's month, so a header never disagrees with its rows' dates.
function yearMonthOf(iso: string): { year: number; month: number } {
  const [year, month] = localDayKey(iso).split("-").map(Number);
  return { year, month };
}

// Move one row's USD in or out of an authoritative month-total map, in place.
// A write patches the map instead of re-running the totals query, so a section
// header follows its list with no second round trip. A month the map does not
// hold is left alone — it was never fetched, so there is no total to correct.
export function addMonthTotal(
  totals: Record<string, number>,
  iso: string,
  deltaUsd: number,
): void {
  if (!deltaUsd) return;
  const key = localMonthKey(iso);
  if (totals[key] === undefined) return;
  totals[key] += deltaUsd;
}

// Monday start keeps the "This Week" window the same in LTR and RTL.
function weekStartDateString(): string {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  return toDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday),
  );
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
  const name = t(`months.${MONTHS[month - 1]}`);
  return `${name} ${year}`;
}

// Group an already date-desc-sorted list into month sections (newest month
// first). Rows keep their incoming order within a section, so the caller stays
// the single source of sort order — this only buckets. `getDate` returns the
// row's ISO date string used for grouping. `getAmountUsd`, when passed, sums
// each row's USD-equivalent amount into `totalUsd` for the section header.
//
// The two newest rows also break out into "Today" and "This Week" buckets that
// sit above the month sections (a row lands in exactly one bucket: today → this
// week → its month). Their day-scoped totals are always summed locally (they're
// the newest rows, so always loaded). A month section whose newest rows were
// peeled has that peeled amount subtracted from its authoritative total so the
// header still reads the correct remainder.
//
// `totalsByMonth`, when passed, is an authoritative "YYYY-MM" → USD total map
// (e.g. from an unpaginated aggregate query) — for any month present there,
// it overrides the local per-row sum. This is what keeps a section's header
// total correct once a month holds more rows than the caller has paginated
// into `items` (a per-row sum would otherwise only cover the loaded page).
export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => string,
  t: TFunction,
  getAmountUsd?: (item: T) => number,
  totalsByMonth?: Record<string, number>,
): MonthSection<T>[] {
  const current = getCurrentYearMonth();
  const today = getTodayDateString();
  const weekStart = weekStartDateString();

  const sections: MonthSection<T>[] = [];
  let currentKey: string | null = null;
  const peeledUsdByMonth: Record<string, number> = {};

  // The bucket a row belongs to: "today", "this-week", or its "YYYY-MM" month.
  function bucketOf(iso: string): {
    key: string;
    title: string;
    monthKey: string;
  } {
    const { year, month } = yearMonthOf(iso);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const day = localDayKey(iso);
    if (day === today) {
      return { key: "today", title: t("common.today"), monthKey };
    }
    if (day >= weekStart && day < today) {
      return { key: "this-week", title: t("common.this_week"), monthKey };
    }
    return {
      key: monthKey,
      title: sectionTitle(year, month, t, current),
      monthKey,
    };
  }

  for (const item of items) {
    const iso = getDate(item);
    const { key, title, monthKey } = bucketOf(iso);
    if (key !== currentKey) {
      sections.push({
        key,
        title,
        data: [],
        totalUsd: getAmountUsd ? 0 : undefined,
      });
      currentKey = key;
    }
    const section = sections[sections.length - 1];
    section.data.push(item);
    if (getAmountUsd) {
      const usd = getAmountUsd(item);
      section.totalUsd = (section.totalUsd ?? 0) + usd;
      if (key === "today" || key === "this-week") {
        peeledUsdByMonth[monthKey] = (peeledUsdByMonth[monthKey] ?? 0) + usd;
      }
    }
  }

  if (getAmountUsd && totalsByMonth) {
    for (const section of sections) {
      if (section.key === "today" || section.key === "this-week") continue;
      const authoritative = totalsByMonth[section.key];
      if (authoritative !== undefined) {
        section.totalUsd = authoritative - (peeledUsdByMonth[section.key] ?? 0);
      }
    }
  }

  return sections;
}
