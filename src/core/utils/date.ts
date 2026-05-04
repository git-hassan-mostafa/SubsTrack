// All date utilities. Comparisons use integer year+month arithmetic to avoid timezone issues.

export function toBillingMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-01`;
}

export function parseBillingMonth(billingMonth: string): { year: number; month: number } {
  const [y, m] = billingMonth.split('-').map(Number);
  return { year: y, month: m };
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function isMonthInFuture(year: number, month: number): boolean {
  const { year: cy, month: cm } = getCurrentYearMonth();
  return year > cy || (year === cy && month > cm);
}

export function isBeforeStartDate(year: number, month: number, startDate: string): boolean {
  const [sy, sm] = startDate.split('-').map(Number);
  return year < sy || (year === sy && month < sm);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}
