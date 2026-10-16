import { toDay } from "./dateRange";

// Clock times use this locale, never the UI language, so Arabic shows English digits.
const TIME_LOCALE = "en-US";

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function toBillingMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

export function shiftBillingMonth(billingMonth: string, by: number): string {
  const [year, month] = billingMonth.split("-").map(Number);
  const day = new Date(year, month - 1 + by, 1);
  return toBillingMonth(day.getFullYear(), day.getMonth() + 1);
}

let pinnedToday: Date | null = null;

// The clock every month rule reads; `onCalendarDay` can pin it for a sync call.
export function currentDate(): Date {
  return pinnedToday ? new Date(pinnedToday) : new Date();
}

// A server clock is UTC, so this pins the caller's own day — gotcha #173.
export function onCalendarDay<T>(day: string, rule: () => T): T {
  const [year, month, date] = day.split("-").map(Number);
  const previous = pinnedToday;
  pinnedToday = new Date(year, month - 1, date, 12, 0, 0);
  try {
    return rule();
  } finally {
    pinnedToday = previous;
  }
}

export function getCurrentYearMonth(): { year: number; month: number } {
  const now = currentDate();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// dd/MM/yyyy (the Lebanese order) of a "YYYY-MM-DD" day.
function dayMonthYear(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

// A bare day is cut as-is: new Date() would shift it west of UTC.
function localDay(iso: string): string {
  return BARE_DAY.test(iso) ? iso : toDay(new Date(iso));
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(TIME_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return dayMonthYear(localDay(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${clockTime(iso)}`;
}

export function formatDateTimeShort(iso: string): string {
  const date = formatDate(iso);
  const thisYear = date.endsWith(String(new Date().getFullYear()));
  return `${thisYear ? date.slice(0, 5) : date} ${clockTime(iso)}`;
}

// A picker value ("YYYY-MM-DD" or "YYYY-MM-DD HH:mm") as the user reads it.
export function formatPickedDay(value: string): string {
  const [day, time] = value.trim().split(/\s+/);
  return time ? `${dayMonthYear(day)} ${time}` : dayMonthYear(day);
}

export function isValidDateString(s: string): boolean {
  return BARE_DAY.test(s) && !isNaN(Date.parse(s));
}

export function isInstantString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

export function getTodayDateString(): string {
  return toDay(currentDate());
}

// Date rolls an overflowing day forward (Mar 31 − 1 month → Mar 3).
export function getDateMonthsAgoString(months: number): string {
  const now = new Date();
  return toDay(
    new Date(now.getFullYear(), now.getMonth() - months, now.getDate()),
  );
}

// YYYY-MM-DD HH:mm for right now — the collect sheet's default "received at",
// which is a real instant the staff member can then adjust.
export function getNowDateTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${getTodayDateString()} ${h}:${min}`;
}

// A bare past day lands at noon (safe in every zone); today keeps the clock.
export function dayToInstantIso(day: string): string {
  const [datePart, timePart] = day.trim().split(/\s+/);
  if (timePart) return new Date(`${datePart}T${timePart}:00`).toISOString();
  if (datePart === getTodayDateString()) return new Date().toISOString();
  return new Date(`${datePart}T12:00:00`).toISOString();
}

// An untouched date field means "now", to the second — not the minute shown.
export function pickedInstantIso(value: string, picked: boolean): string {
  return picked ? dayToInstantIso(value) : new Date().toISOString();
}

// "YYYY-MM" of an instant, read in the device's local zone — the key every
// month-section total is bucketed under. Local on purpose: a UTC slice files an
// early-morning row under the previous month and the header stops agreeing with
// the rows beneath it. A bare day is already a calendar date, so it is cut as-is.
export function localMonthKey(iso: string): string {
  if (!iso.includes("T")) return iso.slice(0, 7);
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Local calendar day of an instant; a bare day is cut as-is — see localMonthKey.
export function localDayKey(iso: string): string {
  if (!iso.includes("T")) return iso.slice(0, 10);
  return toDay(new Date(iso));
}

// Whole days past a due date ("YYYY-MM-DD"), floored at 0 — how far behind a
// bill is. The due day itself is not late.
export function daysLate(dueDate: string, today: Date = new Date()): number {
  const diff = today.getTime() - new Date(`${dueDate}T00:00:00`).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}
