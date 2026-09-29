import type { CsvTable } from "@shared/shared/lib/csv";
import { toCsv } from "@shared/shared/lib/csv";

export function downloadCsv(filename: string, table: CsvTable): void {
  const blob = new Blob([toCsv(table.headers, table.rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
