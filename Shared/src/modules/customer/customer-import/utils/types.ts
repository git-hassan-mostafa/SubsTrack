import type { Branch, Currency, Plan } from "@shared/core/types";
import type { LineFields } from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import type { CustomerInput } from "@shared/modules/customer/customers/services/CustomerService";
import type { ImportCells } from "./importColumns";

// One sheet row as the admin sees it; `rowNumber` is the spreadsheet's own row.
export interface ImportRow {
  id: string;
  rowNumber: number;
  customerKey: string;
  cells: ImportCells;
  problems: string[];
  warnings: string[];
}

// Rows sharing a phone are ONE customer; a problem on any row holds back all of them.
export interface ImportCustomer {
  key: string;
  rowNumbers: number[];
  input: CustomerInput;
  lines: LineFields[];
  ready: boolean;
}

export interface ImportPreview {
  fileName: string;
  fileProblem: string | null;
  unusedColumns: string[];
  rows: ImportRow[];
  customers: ImportCustomer[];
}

export interface ImportLookups {
  branches: readonly Branch[];
  plans: readonly Plan[];
  currencies: readonly Currency[];
  phoneOwners: ReadonlyMap<string, string>;
  ownBranchId: string | null;
  defaultBranchId: string | null;
  today: string;
}

export type ImportOutcome = "imported" | "skipped" | "failed" | "not_run" | "unknown";

export interface ImportCustomerResult {
  outcome: ImportOutcome;
  reason: string | null;
}

export interface ImportRunResult {
  byCustomer: ReadonlyMap<string, ImportCustomerResult>;
  importedCustomers: number;
  importedLines: number;
  failure: string | null;
}
