import { readSheet } from "read-excel-file/browser";
import { parseCsv } from "@shared/shared/lib/csv";

export type ImportFileKind = "xlsx" | "csv";

export const IMPORT_FILE_ACCEPT = ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function importFileKind(name: string): ImportFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

// Excel's plain "CSV" keeps Arabic in Windows-1256; "CSV UTF-8" and Sheets use UTF-8.
function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1256").decode(bytes);
  }
}

// A date cell arrives at UTC midnight, so its UTC day is the day the sheet shows.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function readImportFile(file: File, kind: ImportFileKind): Promise<string[][]> {
  if (kind === "csv") return parseCsv(decodeCsv(await file.arrayBuffer()));
  const rows = await readSheet(file);
  return rows.map((row) => row.map(cellText));
}
