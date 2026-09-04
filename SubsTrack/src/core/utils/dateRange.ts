export interface DateRange {
  startIso: string;
  endExclusiveIso: string;
}

export function toDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Start of a YYYY-MM-DD day as a local-time ISO instant.
export function dayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

// Start of the day AFTER the given one — the exclusive upper bound, so a filter
// covers the whole calendar day. `d + 1` rolls over month/year boundaries.
export function nextDayStartIso(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

export function currentMonthRange(): DateRange {
  const now = new Date();
  return {
    startIso: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    endExclusiveIso: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}

// First → last day of the current month, as the date chips present them.
export function currentMonthDays(): { fromDate: string; toDate: string } {
  const now = new Date();
  return {
    fromDate: toDay(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: toDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function rangeFromDays(from: string, to: string): DateRange {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (!fy || !ty) return currentMonthRange();
  return {
    startIso: new Date(fy, fm - 1, fd).toISOString(),
    endExclusiveIso: new Date(ty, tm - 1, td + 1).toISOString(),
  };
}


export type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'this_year'
  | 'custom';

export const PERIOD_PRESETS: PeriodPreset[] = [
  'this_month',
  'last_month',
  'last_3_months',
  'last_6_months',
  'last_12_months',
  'this_year',
  'custom',
];

export interface ReportPeriod {
  preset: PeriodPreset;
  fromDate: string;
  toDate: string;
}

// Whole calendar months / years, never a partial tail: a preset always ends on
// the last day of its final month, so its buckets and its comparison period are
// the same shape. No future data exists, so the trailing days cost nothing.
export function periodFromPreset(preset: PeriodPreset, now = new Date()): ReportPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();
  const span = (backMonths: number): ReportPeriod => ({
    preset,
    fromDate: toDay(new Date(y, m - backMonths, 1)),
    toDate: toDay(new Date(y, m + 1, 0)),
  });
  switch (preset) {
    case 'last_month':
      return { preset, fromDate: toDay(new Date(y, m - 1, 1)), toDate: toDay(new Date(y, m, 0)) };
    case 'last_3_months':
      return span(2);
    case 'last_6_months':
      return span(5);
    case 'last_12_months':
      return span(11);
    case 'this_year':
      return { preset, fromDate: toDay(new Date(y, 0, 1)), toDate: toDay(new Date(y, 11, 31)) };
    case 'this_month':
    case 'custom':
    default:
      return span(0);
  }
}

export function toRange(p: ReportPeriod): DateRange {
  return rangeFromDays(p.fromDate, p.toDate);
}

// Absolute month index — makes year rollover arithmetic, not a special case.
function monthIndex(day: string): number {
  const [y, m] = day.split('-').map(Number);
  return y * 12 + (m - 1);
}

function isMonthAligned(p: ReportPeriod): boolean {
  const [fy, , fd] = p.fromDate.split('-').map(Number);
  const [ty, tm, td] = p.toDate.split('-').map(Number);
  return fd === 1 && td === new Date(ty, tm, 0).getDate() && fy > 0 && tm > 0;
}

// The comparison period: the same length, immediately before. Month-aligned
// periods shift by whole months (so "last 3 months" compares to the 3 months
// before it, not to 92 raw days); anything custom shifts by its day count.
export function previousPeriod(p: ReportPeriod): ReportPeriod {
  if (isMonthAligned(p)) {
    const months = monthIndex(p.toDate) - monthIndex(p.fromDate) + 1;
    const [fy, fm] = p.fromDate.split('-').map(Number);
    const start = new Date(fy, fm - 1 - months, 1);
    const end = new Date(fy, fm - 1, 0);
    return { preset: 'custom', fromDate: toDay(start), toDate: toDay(end) };
  }
  const [fy, fm, fd] = p.fromDate.split('-').map(Number);
  const [ty, tm, td] = p.toDate.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return {
    preset: 'custom',
    fromDate: toDay(new Date(fy, fm - 1, fd - days)),
    toDate: toDay(new Date(fy, fm - 1, fd - 1)),
  };
}
