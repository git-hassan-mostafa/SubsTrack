import i18n from "@shared/core/i18n";
import type { Plan } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { toLatinDigits } from "@shared/core/utils/digits";
import type { LineFields } from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import type { CustomerInput } from "@shared/modules/customer/customers/services/CustomerService";
import {
  columnOfTitle,
  emptyCells,
  IMPORT_COLUMNS,
  IMPORT_PROBLEM_TITLE,
  type ImportCells,
  type ImportColumn,
} from "./importColumns";
import { isMapLink, matchKey, parseDay, parseNumber, parseYesNo, phoneKey } from "./importText";
import type { ImportCustomer, ImportLookups, ImportPreview, ImportRow } from "./types";

export const MAX_IMPORT_ROWS = 5000;

const USD_NAMES = new Set(["usd", "$", "dollar", "us dollar", "دولار", "دولار اميركي", "دولار امريكي"]);

const CUSTOMER_COLUMNS: readonly ImportColumn[] = [
  "name",
  "area",
  "address",
  "notes",
  "branch",
  "regular",
  "map_link",
];

// The service hands in the SAME checks a hand-added customer and line pass.
export interface ImportRuleChecks {
  customer: (input: CustomerInput) => void;
  lines: (lines: LineFields[]) => void;
}

type Resolved<T> = { value: T } | { problem: string };

function problem(key: string, values?: Record<string, string | number>): string {
  return i18n.t(`customer_import.problem.${key}`, values);
}

function warning(key: string, values?: Record<string, string | number>): string {
  return i18n.t(`customer_import.warning.${key}`, values);
}

function fieldName(column: ImportColumn): string {
  return i18n.t(`customer_import.field.${column}`);
}

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

function emptyPreview(fileName: string, fileProblem: string): ImportPreview {
  return { fileName, fileProblem, unusedColumns: [], rows: [], customers: [] };
}

function readHeader(header: readonly string[]): {
  columns: (ImportColumn | null)[];
  unused: string[];
  repeated: ImportColumn | null;
} {
  const seen = new Set<ImportColumn>();
  const unused: string[] = [];
  let repeated: ImportColumn | null = null;
  const columns = header.map((title) => {
    const column = columnOfTitle(title);
    if (!column) {
      if (title.trim() !== "" && title.trim() !== IMPORT_PROBLEM_TITLE) unused.push(title.trim());
      return null;
    }
    if (seen.has(column)) repeated ??= column;
    seen.add(column);
    return column;
  });
  return { columns, unused, repeated };
}

function cellsOf(row: readonly string[], columns: readonly (ImportColumn | null)[]): ImportCells {
  const cells = emptyCells();
  columns.forEach((column, i) => {
    if (column) cells[column] = (row[i] ?? "").trim();
  });
  return cells;
}

function monthsBefore(day: string, today: string): number {
  const [y, m] = day.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  return ty * 12 + tm - (y * 12 + m);
}

// The first filled value wins; a row disagreeing with it is flagged, never merged.
function agreedValue(rows: ImportRow[], column: ImportColumn): string {
  const owner = rows.find((row) => row.cells[column] !== "");
  if (!owner) return "";
  const agreed = matchKey(owner.cells[column]);
  for (const row of rows) {
    if (row.cells[column] !== "" && matchKey(row.cells[column]) !== agreed) {
      row.problems.push(
        problem("conflict", { field: fieldName(column), row: owner.rowNumber }),
      );
    }
  }
  return owner.cells[column];
}

function resolveBranch(text: string, lookups: ImportLookups): Resolved<string | null> {
  if (text === "") return { value: lookups.defaultBranchId };
  const branch = lookups.branches.find((b) => matchKey(b.name) === matchKey(text));
  if (!branch) return { problem: problem("unknown_branch", { name: text }) };
  if (lookups.ownBranchId && branch.id !== lookups.ownBranchId) {
    return { problem: problem("other_branch_not_allowed", { name: text }) };
  }
  return { value: branch.id };
}

// A branch's own plan beats a plan every branch shares when both carry the name.
function resolvePlan(text: string, branchId: string | null, plans: readonly Plan[]): Resolved<Plan> {
  const named = plans.filter((p) => matchKey(p.name) === matchKey(text));
  if (named.length === 0) return { problem: problem("unknown_plan", { name: text }) };
  const usable = branchId === null ? named : named.filter((p) => p.branchId === null || p.branchId === branchId);
  if (usable.length === 0) return { problem: problem("plan_other_branch", { name: text }) };
  const own = usable.filter((p) => p.branchId !== null && p.branchId === branchId);
  const pool = own.length === 1 ? own : usable;
  if (pool.length > 1) return { problem: problem("plan_ambiguous", { name: text }) };
  return { value: pool[0] };
}

// NULL is USD, as everywhere; a currency is matched on its code, name or symbol.
function resolveCurrency(text: string, plan: Plan, lookups: ImportLookups): Resolved<string | null> {
  if (text === "") return { value: plan.currencyId };
  const key = matchKey(text);
  if (USD_NAMES.has(key)) return { value: null };
  const currency = lookups.currencies.find(
    (c) =>
      c.active &&
      (matchKey(c.code) === key || matchKey(c.name) === key || (c.symbol !== null && matchKey(c.symbol) === key)),
  );
  if (!currency) return { problem: problem("unknown_currency", { name: text }) };
  return { value: currency.id };
}

function lineOf(row: ImportRow, branchId: string | null, lookups: ImportLookups): LineFields | null {
  const { cells } = row;
  if (cells.plan === "") {
    if (cells.start_date || cells.special_price || cells.meter_number || cells.start_reading) {
      row.warnings.push(warning("plan_missing_values"));
    }
    return null;
  }
  const plan = resolvePlan(cells.plan, branchId, lookups.plans);
  if ("problem" in plan) {
    row.problems.push(plan.problem);
    return null;
  }
  const usage = plan.value.usage;
  const startDate = cells.start_date === "" ? lookups.today : parseDay(cells.start_date);
  if (startDate === null) row.problems.push(problem("bad_date", { value: cells.start_date }));

  let customPrice: number | null = null;
  let customCurrencyId: string | null = null;
  if (cells.special_price !== "") {
    customPrice = parseNumber(cells.special_price);
    if (usage) row.problems.push(problem("usage_no_special_price", { name: plan.value.name }));
    else if (customPrice === null) row.problems.push(problem("bad_price", { value: cells.special_price }));
    else {
      const currency = resolveCurrency(cells.currency, plan.value, lookups);
      if ("problem" in currency) row.problems.push(currency.problem);
      else customCurrencyId = currency.value;
    }
  }

  let meterNumber: string | null = null;
  let startReading: number | null = null;
  if (usage?.entry === "reading") {
    meterNumber = cells.meter_number || null;
    if (cells.start_reading !== "") {
      startReading = parseNumber(cells.start_reading);
      if (startReading === null) row.problems.push(problem("bad_reading", { value: cells.start_reading }));
    }
  } else if (cells.meter_number || cells.start_reading) {
    row.warnings.push(warning("meter_not_used", { name: plan.value.name }));
  }

  if (startDate !== null && !usage) {
    const count = monthsBefore(startDate, lookups.today);
    if (count >= 1) {
      row.warnings.push(
        warning("old_start", { count, month: billingMonthLabel(`${startDate.slice(0, 7)}-01`, true) }),
      );
    }
  }

  return {
    planId: plan.value.id,
    startDate: startDate ?? "",
    customPrice,
    customCurrencyId,
    meterNumber,
    startReading,
  };
}

function firstProblemOf(rule: () => void): string | null {
  try {
    rule();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function buildCustomer(rows: ImportRow[], lookups: ImportLookups, checks: ImportRuleChecks): ImportCustomer {
  const first = rows[0];
  const key = `c${first.rowNumber}`;
  for (const row of rows) row.customerKey = key;

  const values = Object.fromEntries(
    CUSTOMER_COLUMNS.map((column) => [column, agreedValue(rows, column)]),
  ) as Record<(typeof CUSTOMER_COLUMNS)[number], string>;
  const phone = toLatinDigits(first.cells.phone);
  const flagAll = (text: string) => rows.forEach((row) => row.problems.push(text));

  const ownPhoneKey = phoneKey(phone);
  if (values.name === "") flagAll(problem("name_missing"));
  if (phone !== "" && ownPhoneKey === null) flagAll(problem("bad_phone", { value: phone }));
  const owner = ownPhoneKey === null ? undefined : lookups.phoneOwners.get(ownPhoneKey);
  if (owner !== undefined) flagAll(problem("phone_in_app", { name: owner }));

  const branch = resolveBranch(values.branch, lookups);
  if ("problem" in branch) flagAll(branch.problem);
  const branchId = "value" in branch ? branch.value : null;

  const regular = values.regular === "" ? true : parseYesNo(values.regular);
  if (regular === null) flagAll(problem("bad_yes_no", { value: values.regular }));
  if (values.map_link !== "" && !isMapLink(values.map_link)) {
    flagAll(problem("bad_map_link", { value: values.map_link }));
  }

  const input: CustomerInput = {
    name: values.name,
    phoneNumber: phone || null,
    address: values.address || null,
    area: values.area || null,
    notes: values.notes || null,
    locationUrl: values.map_link || null,
    branchId,
    isRegular: regular ?? true,
    portalEnabled: false,
    portalPassword: null,
  };
  const lines = rows.flatMap((row) => {
    const line = lineOf(row, branchId, lookups);
    return line ? [line] : [];
  });

  const clean = () => rows.every((row) => row.problems.length === 0);
  if (clean()) {
    const ruleProblem = firstProblemOf(() => checks.customer(input)) ?? firstProblemOf(() => checks.lines(lines));
    if (ruleProblem) flagAll(ruleProblem);
  }

  const ready = clean();
  const blocking = rows.filter((row) => row.problems.length > 0).map((row) => row.rowNumber);
  for (const row of rows) {
    if (row.problems.length === 0 && !ready) {
      row.problems.push(problem("held_by_row", { rows: blocking.join(", ") }));
    }
  }
  return { key, rowNumbers: rows.map((row) => row.rowNumber), input, lines, ready };
}

// Rows with the same phone are one customer; a row without a phone is its own.
export function buildImportPreview(
  fileName: string,
  sheet: readonly (readonly string[])[],
  lookups: ImportLookups,
  checks: ImportRuleChecks,
): ImportPreview {
  const headerIndex = sheet.findIndex((row) => !isBlankRow(row));
  if (headerIndex < 0) return emptyPreview(fileName, problem("empty_file"));
  const header = readHeader(sheet[headerIndex]);
  if (!header.columns.includes("name")) return emptyPreview(fileName, problem("no_name_column"));
  if (header.repeated) {
    const title = IMPORT_COLUMNS.find((c) => c.column === header.repeated)?.title ?? header.repeated;
    return emptyPreview(fileName, problem("repeated_column", { name: title }));
  }

  const rows: ImportRow[] = [];
  sheet.forEach((cells, index) => {
    if (index <= headerIndex || isBlankRow(cells)) return;
    const rowNumber = index + 1;
    rows.push({
      id: `r${rowNumber}`,
      rowNumber,
      customerKey: "",
      cells: cellsOf(cells, header.columns),
      problems: [],
      warnings: [],
    });
  });
  if (rows.length === 0) return emptyPreview(fileName, problem("no_rows"));
  if (rows.length > MAX_IMPORT_ROWS) {
    return emptyPreview(fileName, problem("too_many_rows", { count: rows.length, max: MAX_IMPORT_ROWS }));
  }

  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const groupKey = phoneKey(row.cells.phone) ?? row.id;
    const group = groups.get(groupKey);
    if (group) group.push(row);
    else groups.set(groupKey, [row]);
  }
  const customers = [...groups.values()].map((group) => buildCustomer(group, lookups, checks));

  return { fileName, fileProblem: null, unusedColumns: header.unused, rows, customers };
}
