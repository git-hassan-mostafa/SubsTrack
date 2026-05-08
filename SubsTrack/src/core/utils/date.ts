// All date utilities. Comparisons use integer year+month arithmetic to avoid timezone issues.

export function toBillingMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function isBeforeStartDate(
  year: number,
  month: number,
  startDate: string,
): boolean {
  const [sy, sm] = startDate.split("-").map(Number);
  return year < sy || (year === sy && month < sm);
}

export function formatCurrency(amount: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) && !isNaN(Date.parse(s));
}
