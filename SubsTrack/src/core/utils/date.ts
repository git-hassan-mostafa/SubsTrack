// All date utilities. Comparisons use integer year+month arithmetic to avoid timezone issues.

export function getDateLocale(language: string): string {
  return "en-US";
}

export function toBillingMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Today's day-of-month (1–31). Split out so the unpaid-rule logic is testable. */
export function getCurrentDayOfMonth(): number {
  return new Date().getDate();
}

export function isBeforeStartDate(
  year: number,
  month: number,
  startDate: string,
): boolean {
  const [sy, sm] = startDate.split("-").map(Number);
  return year < sy || (year === sy && month < sm);
}

/** Day-of-month of a YYYY-MM-DD start date; 1 when the day part is missing. */
export function startDayOfMonth(startDate: string): number {
  const day = Number(startDate.split("-")[2]);
  return Number.isFinite(day) && day >= 1 ? day : 1;
}

/**
 * Under the 'customer_start_day' unpaid rule, has the CURRENT month reached the
 * line's billing day yet? A start day past the end of a short month (e.g. the
 * 31st in February) clamps to that month's last day, so the month still becomes
 * due rather than being skipped entirely.
 */
export function hasReachedStartDay(
  year: number,
  month: number,
  startDate: string,
): boolean {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dueDay = Math.min(startDayOfMonth(startDate), daysInMonth);
  return getCurrentDayOfMonth() >= dueDay;
}

/**
 * Does an unpaid (year, month) count as "not owed yet" for a line starting on
 * `startDate`? Only ever true for the CURRENT month under the
 * 'customer_start_day' rule — past months are always due. Shared by the grid
 * and both repositories' status queries so all three stay in lockstep.
 */
export function isNotDueYet(
  rule: "month_start" | "customer_start_day",
  year: number,
  month: number,
  startDate: string,
): boolean {
  if (rule !== "customer_start_day") return false;
  const { year: cy, month: cm } = getCurrentYearMonth();
  if (year !== cy || month !== cm) return false;
  return !hasReachedStartDay(year, month, startDate);
}

export function formatDate(iso: string, locale = "en-US", options: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
}): string {
  return new Date(iso).toLocaleDateString(locale, options);
}

// Date + clock time, for logs where the exact moment matters (e.g. stock history).
export function formatDateTime(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Same stamp, minus the year while it's the current one — keeps a log row's
// "who · when" line on one line on a phone.
export function formatDateTimeShort(iso: string, locale = "en-US"): string {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// YYYY-MM-DD for `months` calendar months before today (clamps to the last
// valid day, e.g. Mar 31 → Feb 28). Used for the payments list default range.
export function getDateMonthsAgoString(months: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
