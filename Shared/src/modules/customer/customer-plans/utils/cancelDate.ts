import { isValidDateString } from "@shared/core/utils/date";

export type CancelDateBounds = { min: string; max: string };

export type RemoveLineChoice =
  | { hardDelete: true }
  | { hardDelete: false; cancelDate: string };

// Never before money (#106); a paid-ahead line stops in its last paid month.
export function cancelDateBounds(
  startDate: string,
  lastPaidMonth: string | null,
  today: string,
): CancelDateBounds {
  const paidTo = lastPaidMonth ?? "";
  const max = paidTo > today ? paidTo : today;
  const floor = paidTo > startDate ? paidTo : startDate;
  return { min: floor < max ? floor : max, max };
}

export function isCancelDateAllowed(day: string, bounds: CancelDateBounds): boolean {
  return isValidDateString(day) && day >= bounds.min && day <= bounds.max;
}

export function removeLineChoice(hardDelete: boolean, cancelDate: string): RemoveLineChoice {
  return hardDelete ? { hardDelete: true } : { hardDelete: false, cancelDate };
}
