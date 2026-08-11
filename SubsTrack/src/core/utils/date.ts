// Generic date utilities. Comparisons use integer year+month arithmetic to avoid
// timezone issues. Rules that only mean something to a subscription month (is it
// started / owed / late?) live in customer-payments' utils/monthDueRules.ts.

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
