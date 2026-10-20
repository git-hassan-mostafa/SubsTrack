import i18n from "@shared/core/i18n";
import type { CsvTable } from "@shared/shared/lib/csv";
import { IMPORT_COLUMNS, IMPORT_PROBLEM_TITLE } from "./importColumns";
import type { ImportCustomerResult, ImportPreview, ImportRow, ImportRunResult } from "./types";

export interface ImportCounts {
  readyCustomers: number;
  readyLines: number;
  heldCustomers: number;
  problemRows: number;
}

export function importCounts(preview: ImportPreview): ImportCounts {
  const ready = preview.customers.filter((c) => c.ready);
  return {
    readyCustomers: ready.length,
    readyLines: ready.reduce((sum, c) => sum + c.lines.length, 0),
    heldCustomers: preview.customers.length - ready.length,
    problemRows: preview.rows.filter((row) => row.problems.length > 0).length,
  };
}

const SKIPPED: ImportCustomerResult = { outcome: "skipped", reason: null };

export function rowResult(row: ImportRow, result: ImportRunResult): ImportCustomerResult {
  return result.byCustomer.get(row.customerKey) ?? SKIPPED;
}

// A skipped row's reason is its own problems; a row that never ran says why the run stopped.
export function rowReason(row: ImportRow, result: ImportRunResult): string {
  const { outcome, reason } = rowResult(row, result);
  if (outcome === "skipped") return row.problems.join(" · ");
  return reason ?? "";
}

export function importSummaryTable(preview: ImportPreview, result: ImportRunResult): CsvTable {
  const t = i18n.t.bind(i18n);
  return {
    headers: [
      t("customer_import.summary.row"),
      t("customer_import.field.name"),
      t("customer_import.field.phone"),
      t("customer_import.field.plan"),
      t("customer_import.summary.result"),
      t("customer_import.summary.reason"),
    ],
    rows: preview.rows.map((row) => [
      row.rowNumber,
      row.cells.name,
      row.cells.phone,
      row.cells.plan,
      t(`customer_import.outcome.${rowResult(row, result).outcome}`),
      rowReason(row, result),
    ]),
  };
}

// The template layout again, so the admin fixes these rows and imports the same file.
export function rowsToFixTable(preview: ImportPreview, result: ImportRunResult): CsvTable {
  const left = preview.rows.filter((row) => rowResult(row, result).outcome !== "imported");
  return {
    headers: [...IMPORT_COLUMNS.map((c) => c.title), IMPORT_PROBLEM_TITLE],
    rows: left.map((row) => [...IMPORT_COLUMNS.map(({ column }) => row.cells[column]), rowReason(row, result)]),
  };
}
