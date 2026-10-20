import writeExcelFile, { type SheetData } from "write-excel-file/browser";
import { importTemplate } from "@shared/modules/customer/customer-import/utils/importColumns";

const MIN_WIDTH = 14;
const MAX_WIDTH = 40;

// Text format "@" stops Excel turning "03 123 456" or "01/10/2026" into a number or date.
export async function downloadImportTemplate(fileName: string, rightToLeft: boolean): Promise<void> {
  const { headers, rows } = importTemplate();
  const data: SheetData = [
    headers.map((title) => ({ value: title, fontWeight: "bold" as const })),
    ...rows.map((row) => row.map((value) => (value ? { value, type: String, format: "@" } : null))),
  ];
  const columns = headers.map((title) => ({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, title.length)) }));
  await writeExcelFile(data, { columns, stickyRowsCount: 1, rightToLeft }).toFile(`${fileName}.xlsx`);
}
