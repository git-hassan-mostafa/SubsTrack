import { shareTextFile } from "@/src/shared/lib/shareFile";

export type CsvValue = string | number | null;

/** A sheet ready to write: one header row plus its rows, already stringified. */
export interface CsvTable {
  headers: string[];
  rows: CsvValue[][];
}

// RFC-4180 quoting — a comma or quote in a name corrupts a hand-rolled CSV
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return (
    "\ufeff" +
    [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  );
}

/** False when the platform cannot share — the caller shows an error banner. */
export async function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
): Promise<boolean> {
  return shareTextFile(
    filename,
    "csv",
    toCsv(headers, rows),
    "text/csv;charset=utf-8;",
    "public.comma-separated-values-text",
  );
}
