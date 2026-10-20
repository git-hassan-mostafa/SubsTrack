import type { CsvTable } from "@shared/shared/lib/csv";
import { matchKey } from "./importText";

export type ImportColumn =
  | "name"
  | "phone"
  | "area"
  | "address"
  | "notes"
  | "branch"
  | "plan"
  | "start_date"
  | "special_price"
  | "currency"
  | "regular"
  | "map_link"
  | "meter_number"
  | "start_reading";

export type ImportCells = Record<ImportColumn, string>;

// Template order; the title is both languages so one file serves every admin.
export const IMPORT_COLUMNS: readonly { column: ImportColumn; title: string; aliases: string[] }[] = [
  { column: "name", title: "Name / الاسم", aliases: ["name", "customer", "customer name", "الاسم", "اسم", "اسم العميل", "اسم الزبون"] },
  { column: "phone", title: "Phone / الهاتف", aliases: ["phone", "phone number", "mobile", "الهاتف", "رقم الهاتف", "الجوال", "الخلوي", "موبايل"] },
  { column: "area", title: "Area / المنطقة", aliases: ["area", "region", "المنطقة", "منطقة"] },
  { column: "address", title: "Address / العنوان", aliases: ["address", "العنوان", "عنوان"] },
  { column: "notes", title: "Notes / ملاحظات", aliases: ["notes", "note", "ملاحظات", "ملاحظة"] },
  { column: "branch", title: "Branch / الفرع", aliases: ["branch", "branch name", "الفرع", "فرع", "اسم الفرع"] },
  { column: "plan", title: "Plan / الخطة", aliases: ["plan", "plan name", "subscription", "الخطة", "خطة", "اسم الخطة", "الاشتراك"] },
  { column: "start_date", title: "Start date (DD/MM/YYYY) / تاريخ البداية", aliases: ["start date", "start", "start date (dd/mm/yyyy)", "تاريخ البداية", "تاريخ البدء"] },
  { column: "special_price", title: "Special price / السعر الخاص", aliases: ["special price", "price", "custom price", "السعر الخاص", "سعر خاص", "السعر"] },
  { column: "currency", title: "Special price currency / عملة السعر الخاص", aliases: ["special price currency", "currency", "price currency", "عملة السعر الخاص", "العملة", "عملة"] },
  { column: "regular", title: "Regular (yes/no) / عميل منتظم (نعم/لا)", aliases: ["regular", "regular (yes/no)", "regular customer", "عميل منتظم", "عميل منتظم (نعم/لا)", "منتظم"] },
  { column: "map_link", title: "Map link / الموقع على الخريطة", aliases: ["map link", "map", "location", "google maps", "الموقع على الخريطة", "الموقع", "رابط الخريطة"] },
  { column: "meter_number", title: "Meter number / رقم العداد", aliases: ["meter number", "meter", "رقم العداد", "العداد"] },
  { column: "start_reading", title: "Start reading / قراءة البداية", aliases: ["start reading", "first reading", "قراءة البداية", "القراءة الأولى"] },
];

// The extra column on a "rows to fix" file; reading it back ignores it.
export const IMPORT_PROBLEM_TITLE = "Problem / المشكلة";

const EXAMPLE_ROWS: readonly Partial<ImportCells>[] = [
  { name: "Ali Hassan", phone: "03 123 456", area: "Hamra", address: "Main street, building 4", branch: "", plan: "Internet 10M", start_date: "01/10/2026", regular: "yes" },
  { name: "Ali Hassan", phone: "03 123 456", area: "Hamra", plan: "TV", start_date: "01/10/2026", special_price: "15", currency: "USD", regular: "yes" },
];

const ALIAS_TO_COLUMN = new Map<string, ImportColumn>(
  IMPORT_COLUMNS.flatMap(({ column, title, aliases }) =>
    [title, ...aliases].map((alias) => [matchKey(alias), column] as const),
  ),
);

// A title "Name / الاسم" matches on its whole text or on either half.
export function columnOfTitle(title: string): ImportColumn | null {
  const whole = ALIAS_TO_COLUMN.get(matchKey(title));
  if (whole) return whole;
  for (const part of title.split(/[/|]/)) {
    const column = ALIAS_TO_COLUMN.get(matchKey(part));
    if (column) return column;
  }
  return null;
}

export function emptyCells(): ImportCells {
  return Object.fromEntries(IMPORT_COLUMNS.map(({ column }) => [column, ""])) as ImportCells;
}

export function importTemplate(): CsvTable {
  return {
    headers: IMPORT_COLUMNS.map((c) => c.title),
    rows: EXAMPLE_ROWS.map((row) => IMPORT_COLUMNS.map(({ column }) => row[column] ?? "")),
  };
}
