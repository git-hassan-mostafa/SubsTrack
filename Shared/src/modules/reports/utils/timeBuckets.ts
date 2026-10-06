import { localDayKey } from "@shared/core/utils/date";
import { toDay, type ReportPeriod } from "@shared/core/utils/dateRange";

export type TimeGrain = "day" | "week" | "month";

export const TIME_GRAINS: readonly TimeGrain[] = ["day", "week", "month"];

const DAY_MS = 86_400_000;

const MAX_DAY_BUCKETS = 31;

const MAX_WEEK_BUCKETS = 16;

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysIn(period: ReportPeriod): number {
  const span = parseDay(period.toDate).getTime() - parseDay(period.fromDate).getTime();
  return Math.round(span / DAY_MS) + 1;
}

// Short periods read best by day, a quarter by week, anything longer by month.
export function defaultGrain(period: ReportPeriod): TimeGrain {
  const days = daysIn(period);
  if (days <= MAX_DAY_BUCKETS) return "day";
  if (days <= MAX_WEEK_BUCKETS * 7) return "week";
  return "month";
}

// Weeks start on Monday — the working week of the businesses using the app.
function startOf(day: Date, grain: TimeGrain): Date {
  if (grain === "month") return new Date(day.getFullYear(), day.getMonth(), 1);
  if (grain === "week") {
    const back = (day.getDay() + 6) % 7;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
  }
  return day;
}

function next(day: Date, grain: TimeGrain): Date {
  if (grain === "month") return new Date(day.getFullYear(), day.getMonth() + 1, 1);
  const step = grain === "week" ? 7 : 1;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + step);
}

// The YYYY-MM-DD a row's instant falls in, read in local time like every month total.
export function bucketOf(iso: string, grain: TimeGrain): string {
  return toDay(startOf(parseDay(localDayKey(iso)), grain));
}

// Every bucket the period touches, oldest first, so an empty one still shows as zero.
export function periodBuckets(period: ReportPeriod, grain: TimeGrain): string[] {
  const last = parseDay(period.toDate);
  const out: string[] = [];
  for (
    let at = startOf(parseDay(period.fromDate), grain);
    at.getTime() <= last.getTime();
    at = next(at, grain)
  ) {
    out.push(toDay(at));
  }
  return out;
}
