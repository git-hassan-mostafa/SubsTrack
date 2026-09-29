import { shareTextFile } from "@/src/shared/lib/shareFile";
import { toCsv } from "@shared/shared/lib/csv";

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
