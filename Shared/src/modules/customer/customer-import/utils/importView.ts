import type { Tone } from "@shared/shared/lib/tone";
import { rowResult } from "./importResult";
import type { ImportOutcome, ImportRow, ImportRunResult } from "./types";

export type ImportRowStatus = "ready" | "warning" | "problem" | ImportOutcome;

export function previewRowStatus(row: ImportRow): ImportRowStatus {
  if (row.problems.length > 0) return "problem";
  return row.warnings.length > 0 ? "warning" : "ready";
}

export function importRowStatus(row: ImportRow, result: ImportRunResult | null): ImportRowStatus {
  return result ? rowResult(row, result).outcome : previewRowStatus(row);
}

const TONES: Record<ImportRowStatus, Tone> = {
  ready: "emerald",
  warning: "amber",
  problem: "red",
  imported: "emerald",
  skipped: "gray",
  failed: "red",
  not_run: "red",
  unknown: "amber",
};

export function importStatusTone(status: ImportRowStatus): Tone {
  return TONES[status];
}

// "left" = what still needs the admin: a problem before the run, not imported after it.
export type ImportRowFilter = "problem" | "warning" | "left";

export function filterImportRows(
  rows: readonly ImportRow[],
  result: ImportRunResult | null,
  filter: ImportRowFilter | null,
): ImportRow[] {
  if (filter === null) return [...rows];
  return rows.filter((row) => {
    const status = importRowStatus(row, result);
    if (filter === "left") return status !== "imported" && status !== "ready" && status !== "warning";
    return status === filter;
  });
}
