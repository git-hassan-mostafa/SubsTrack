import { MONTHS } from "@/src/core/constants";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function getBlockRangeLabel(billingMonth: string, durationMonths: number, t: TFn): string {
  const [startYear, startMonthNum] = billingMonth.split("-").map(Number);
  const startLabel = MONTHS[startMonthNum - 1];
  if (durationMonths === 1) {
    return `${t(`months.${startLabel}`)} ${startYear}`;
  }
  const endDate = new Date(startYear, startMonthNum - 1 + durationMonths - 1, 1);
  const endLabel = MONTHS[endDate.getMonth()];
  const endYear = endDate.getFullYear();
  if (startYear === endYear) {
    return `${t(`months.${startLabel}`)} – ${t(`months.${endLabel}`)} ${startYear}`;
  }
  return `${t(`months.${startLabel}`)} ${startYear} – ${t(`months.${endLabel}`)} ${endYear}`;
}
