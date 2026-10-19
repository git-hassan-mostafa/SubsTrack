import type {
  LineUsage,
  MeterChange,
  StatusReading,
  UsageEntry,
  UsageMonth,
} from "@shared/core/types";
import { shiftBillingMonth } from "@shared/core/utils/date";
import {
  previousReadingOf,
  usageMonthOf,
  usageUnitsOf,
} from "@shared/modules/customer/customer-payments/utils/usageBill";

export interface MeterChangeDraft {
  oldMeterFinal: number | null;
  newMeterStart: number | null;
  newMeterNumber: string;
}

export interface ReadingDraft {
  value: number | null;
  meterChange: MeterChangeDraft | null;
}

export type ReadingWarning = "high_usage";

export type ReadingProblem =
  | "below_previous"
  | "old_meter_below_previous"
  | "below_new_meter_start"
  | "above_next";

export interface ReadingPreview {
  previousReading: number | null;
  units: number | null;
  month: UsageMonth | null;
  usualUnits: number | null;
  warnings: ReadingWarning[];
  problems: ReadingProblem[];
  nextReading: number | null;
}

export interface ReadingInput {
  value: number;
  meterChange: MeterChange | null;
}

const USUAL_MONTHS = 3;

export const EMPTY_METER_CHANGE: MeterChangeDraft = {
  oldMeterFinal: null,
  newMeterStart: null,
  newMeterNumber: "",
};

const isAmount = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;

export function readingDraftOf(
  saved: StatusReading | null,
  entry: UsageEntry,
): ReadingDraft {
  const change = entry === "reading" ? (saved?.meterChange ?? null) : null;
  return {
    value: (entry === "reading" ? saved?.reading : saved?.units) ?? null,
    meterChange: change
      ? { ...change, newMeterNumber: change.newMeterNumber ?? "" }
      : null,
  };
}

// A meter change counts only on a meter plan, and only with both of its readings.
export function readingInputOf(
  draft: ReadingDraft,
  entry: UsageEntry,
): ReadingInput | null {
  if (!isAmount(draft.value)) return null;
  const change = entry === "reading" ? draft.meterChange : null;
  if (!change) return { value: draft.value, meterChange: null };
  if (!isAmount(change.oldMeterFinal) || !isAmount(change.newMeterStart)) {
    return null;
  }
  return {
    value: draft.value,
    meterChange: {
      oldMeterFinal: change.oldMeterFinal,
      newMeterStart: change.newMeterStart,
      newMeterNumber: change.newMeterNumber.trim() || null,
    },
  };
}

export function isReadingDraftChanged(
  draft: ReadingDraft,
  saved: StatusReading | null,
  entry: UsageEntry,
): boolean {
  const before = readingInputOf(readingDraftOf(saved, entry), entry);
  const after = readingInputOf(draft, entry);
  return JSON.stringify(before) !== JSON.stringify(after);
}

// "Usual" = the average of up to 3 earlier months whose units are known.
export function usualUnitsOf(usage: LineUsage, billingMonth: string): number | null {
  const known: number[] = [];
  for (let back = 1; back <= USUAL_MONTHS; back++) {
    const units = usageUnitsOf(usage, shiftBillingMonth(billingMonth, -back));
    if (units !== null) known.push(units);
  }
  if (known.length === 0) return null;
  return known.reduce((sum, units) => sum + units, 0) / known.length;
}

export function isHighUsage(
  units: number,
  usualUnits: number | null,
  highUsagePercent: number | null,
): boolean {
  if (highUsagePercent === null || usualUnits === null || usualUnits <= 0) {
    return false;
  }
  return units > usualUnits * (1 + highUsagePercent / 100);
}

// The month as it WOULD be with the typed reading — the same rules the grid runs.
export function readingPreview(
  usage: LineUsage,
  billingMonth: string,
  draft: ReadingDraft,
  recordedAt: string,
  highUsagePercent: number | null,
): ReadingPreview {
  const previousReading =
    usage.entry === "reading" ? previousReadingOf(usage, billingMonth) : null;
  const usualUnits = usualUnitsOf(usage, billingMonth);
  const nextReading = usage.entry === "reading" ? nextReadingOf(usage, billingMonth) : null;
  const input = readingInputOf(draft, usage.entry);
  if (!input) {
    return {
      previousReading,
      units: null,
      month: null,
      usualUnits,
      warnings: [],
      problems: [],
      nextReading,
    };
  }
  const readings = new Map(usage.readings);
  readings.set(billingMonth, {
    billingMonth,
    reading: usage.entry === "reading" ? input.value : null,
    units: usage.entry === "direct" ? input.value : null,
    meterChange: input.meterChange,
    recordedAt,
  });
  const trial: LineUsage = { ...usage, readings };
  const month = usageMonthOf(trial, billingMonth);
  const units = usageUnitsOf(trial, billingMonth);
  const warnings: ReadingWarning[] =
    units !== null && isHighUsage(units, usualUnits, highUsagePercent) ? ["high_usage"] : [];
  return {
    previousReading,
    units,
    month,
    usualUnits,
    warnings,
    problems: readingProblemsOf(usage, billingMonth, input),
    nextReading,
  };
}

// What next month's units count from: the old meter's last reading if it was replaced.
export function nextReadingOf(usage: LineUsage, billingMonth: string): number | null {
  const next = usage.readings.get(shiftBillingMonth(billingMonth, 1));
  return next?.meterChange?.oldMeterFinal ?? next?.reading ?? null;
}

// A meter only counts up; going down is allowed only as a meter replaced this month.
export function readingProblemsOf(
  usage: LineUsage,
  billingMonth: string,
  input: ReadingInput,
): ReadingProblem[] {
  if (usage.entry !== "reading") return [];
  const problems: ReadingProblem[] = [];
  const previous = previousReadingOf(usage, billingMonth);
  const change = input.meterChange;
  if (change) {
    if (previous !== null && change.oldMeterFinal < previous) {
      problems.push("old_meter_below_previous");
    }
    if (input.value < change.newMeterStart) problems.push("below_new_meter_start");
  } else if (previous !== null && input.value < previous) {
    problems.push("below_previous");
  }
  const next = nextReadingOf(usage, billingMonth);
  const saved = usage.readings.get(billingMonth)?.reading ?? null;
  const nextAlreadyBelow = saved !== null && next !== null && saved > next;
  if (next !== null && input.value > next && !nextAlreadyBelow) problems.push("above_next");
  return problems;
}
