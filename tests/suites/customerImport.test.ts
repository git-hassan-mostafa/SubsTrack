import type { Branch } from "@shared/core/types";
import { toLatinDigits } from "@shared/core/utils/digits";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import customerPlanService from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import { customerImportService } from "@shared/modules/customer/customer-import/services/CustomerImportService";
import { IMPORT_COLUMNS, importTemplate } from "@shared/modules/customer/customer-import/utils/importColumns";
import { rowsToFixTable } from "@shared/modules/customer/customer-import/utils/importResult";
import { parseDay, parseNumber, phoneKey } from "@shared/modules/customer/customer-import/utils/importText";
import type { ImportLookups, ImportPreview } from "@shared/modules/customer/customer-import/utils/types";
import { parseCsv, toCsv } from "@shared/shared/lib/csv";
import { fakeCustomerImportRepository } from "../helpers/fakeCustomerImport";
import { LBP, plan } from "../helpers/factories";

// TC-CI-* — customers imported from a file follow the hand-added rules, the
// limits are checked for the WHOLE file first, and a failed group says exactly
// which rows went in.

const branch = (id: string, name: string): Branch => ({
  id,
  tenantId: "t1",
  name,
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

const MAIN = branch("b-main", "Main");
const NORTH = branch("b-north", "North");
const INTERNET = plan({ id: "p-net", name: "Internet 10M" });
const TV = plan({ id: "p-tv", name: "TV", currencyId: LBP.id, price: 450000 });
const NORTH_ONLY = plan({ id: "p-north", name: "Village", branchId: NORTH.id });
const METER = plan({
  id: "p-meter",
  name: "Generator",
  price: null,
  usage: { entry: "reading", unitName: "kWh", feeName: "Fee", highUsagePercent: null },
});

const lookups = (over: Partial<ImportLookups> = {}): ImportLookups => ({
  branches: [MAIN, NORTH],
  plans: [INTERNET, TV, NORTH_ONLY, METER],
  currencies: [LBP],
  phoneOwners: new Map(),
  ownBranchId: null,
  defaultBranchId: MAIN.id,
  today: "2026-10-20",
  ...over,
});

const HEADER = ["Name", "Phone", "Area", "Branch", "Plan", "Start date", "Special price", "Currency", "Regular", "Meter number", "Start reading"];

function previewOf(rows: string[][], over: Partial<ImportLookups> = {}): ImportPreview {
  return customerImportService.preview("test.csv", [HEADER, ...rows], lookups(over));
}

const row = (cells: Partial<Record<(typeof HEADER)[number], string>>): string[] =>
  HEADER.map((title) => cells[title] ?? "");

describe("customer import: reading the file", () => {
  it("TC-CI-01 a CSV keeps quoted commas, quotes and line breaks inside one cell", () => {
    const text = '﻿Name,Notes\r\n"Hassan, Ali","says ""hi""\nat night"\r\nSara,\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Notes"],
      ["Hassan, Ali", 'says "hi"\nat night'],
      ["Sara", ""],
    ]);
  });

  it("TC-CI-02 a semicolon file (Arabic-language Excel) reads the same", () => {
    expect(parseCsv("Name;Phone\nAli;03 123 456")).toEqual([
      ["Name", "Phone"],
      ["Ali", "03 123 456"],
    ]);
  });

  it("TC-CI-03 the downloaded template reads back as the same columns", () => {
    const template = importTemplate();
    const sheet = parseCsv(toCsv(template.headers, template.rows));
    const preview = customerImportService.preview("template.csv", sheet, lookups());
    expect(preview.fileProblem).toBeNull();
    expect(preview.unusedColumns).toEqual([]);
    expect(preview.customers).toHaveLength(1);
    expect(preview.customers[0].lines).toHaveLength(2);
  });

  it("TC-CI-04 Arabic titles and Arabic digits work", () => {
    const sheet = [
      ["الاسم", "الهاتف", "الخطة", "تاريخ البداية", "السعر الخاص"],
      ["علي حسن", "٠٣ ١٢٣ ٤٥٦", "Internet 10M", "٠١/١٠/٢٠٢٦", "١٥"],
    ];
    const preview = customerImportService.preview("ar.xlsx", sheet, lookups());
    const [customer] = preview.customers;
    expect(customer.ready).toBe(true);
    expect(customer.input.phoneNumber).toBe("03 123 456");
    expect(customer.lines[0]).toMatchObject({ startDate: "2026-10-01", customPrice: 15 });
  });

  it("TC-CI-05 a file without a Name column imports nothing", () => {
    const preview = customerImportService.preview("x.csv", [["Phone"], ["03123456"]], lookups());
    expect(preview.fileProblem).toBe("customer_import.problem.no_name_column");
    expect(preview.customers).toEqual([]);
  });

  it("TC-CI-06 phones match whatever way they are written", () => {
    const key = phoneKey("03 123 456");
    expect(phoneKey("+961 3 123 456")).toBe(key);
    expect(phoneKey("00961-3-123456")).toBe(key);
    expect(phoneKey(toLatinDigits("٠٣١٢٣٤٥٦"))).toBe(key);
    expect(phoneKey("-")).toBeNull();
  });

  it("TC-CI-07 dates are day-first or ISO, and a day that does not exist is refused", () => {
    expect(parseDay("01/10/2026")).toBe("2026-10-01");
    expect(parseDay("1-3-2026")).toBe("2026-03-01");
    expect(parseDay("2026-03-01")).toBe("2026-03-01");
    expect(parseDay("31/02/2026")).toBeNull();
    expect(parseDay("March 2026")).toBeNull();
  });

  it("TC-CI-08 a price may carry thousands commas; anything else is not a number", () => {
    expect(parseNumber("1,500,000")).toBe(1500000);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("15$")).toBeNull();
  });
});

describe("customer import: one customer per phone", () => {
  it("TC-CI-10 rows with the same phone become ONE customer with several plans", () => {
    const preview = previewOf([
      row({ Name: "Ali", Phone: "03 123 456", Plan: "Internet 10M", "Start date": "01/09/2026" }),
      row({ Name: "Ali", Phone: "+961 3 123456", Plan: "TV", "Start date": "01/10/2026" }),
      row({ Name: "Sara", Plan: "Internet 10M" }),
    ]);
    expect(preview.customers).toHaveLength(2);
    expect(preview.customers[0].lines.map((l) => l.planId)).toEqual([INTERNET.id, TV.id]);
    expect(preview.customers[1].lines).toHaveLength(1);
    expect(preview.customers.every((c) => c.ready)).toBe(true);
  });

  it("TC-CI-11 a phone already in the app holds back the whole customer", () => {
    const preview = previewOf(
      [row({ Name: "Ali", Phone: "03123456", Plan: "Internet 10M" })],
      { phoneOwners: new Map([["3123456", "Ali Hassan"]]) },
    );
    expect(preview.customers[0].ready).toBe(false);
    expect(preview.rows[0].problems).toEqual(["customer_import.problem.phone_in_app name=Ali Hassan"]);
  });

  it("TC-CI-12 two rows of one phone that disagree are flagged, and the other row is held too", () => {
    const preview = previewOf([
      row({ Name: "Ali", Phone: "03123456", Area: "Hamra", Plan: "Internet 10M" }),
      row({ Name: "Ali", Phone: "03123456", Area: "Verdun", Plan: "TV" }),
    ]);
    expect(preview.customers[0].ready).toBe(false);
    expect(preview.rows[1].problems[0]).toContain("customer_import.problem.conflict");
    expect(preview.rows[0].problems[0]).toContain("customer_import.problem.held_by_row rows=3");
  });

  it("TC-CI-13 a missing name, unknown plan and unknown branch each block the customer", () => {
    const preview = previewOf([
      row({ Phone: "03111111", Plan: "Internet 10M" }),
      row({ Name: "B", Plan: "Gold" }),
      row({ Name: "C", Branch: "South" }),
    ]);
    expect(preview.rows.map((r) => r.problems[0])).toEqual([
      "customer_import.problem.name_missing",
      "customer_import.problem.unknown_plan name=Gold",
      "customer_import.problem.unknown_branch name=South",
    ]);
    expect(preview.customers.some((c) => c.ready)).toBe(false);
  });

  it("TC-CI-14 a branch admin cannot import into another branch, nor use its plans", () => {
    const own = { ownBranchId: MAIN.id };
    const other = previewOf([row({ Name: "A", Branch: "North" })], own);
    expect(other.rows[0].problems[0]).toContain("other_branch_not_allowed");
    const plan = previewOf([row({ Name: "A", Plan: "Village" })], own);
    expect(plan.rows[0].problems[0]).toContain("plan_other_branch");
  });
});

describe("customer import: the same rules as a hand-added line", () => {
  it("TC-CI-20 a special price with no currency takes the plan's currency; USD is null", () => {
    const preview = previewOf([
      row({ Name: "A", Plan: "TV", "Special price": "300000" }),
      row({ Name: "B", Plan: "TV", "Special price": "10", Currency: "USD" }),
      row({ Name: "C", Plan: "Internet 10M", "Special price": "1,500,000", Currency: "lbp" }),
    ]);
    expect(preview.customers.map((c) => c.lines[0].customCurrencyId)).toEqual([LBP.id, null, LBP.id]);
    expect(preview.customers[2].lines[0].customPrice).toBe(1500000);
  });

  it("TC-CI-21 a zero price is refused by the SAME check the customer form runs", () => {
    const preview = previewOf([row({ Name: "A", Plan: "Internet 10M", "Special price": "0" })]);
    expect(preview.customers[0].ready).toBe(false);
    expect(preview.rows[0].problems).toEqual(["errors.custom_price_positive"]);
  });

  it("TC-CI-22 a usage plan never takes a special price; its meter columns are kept", () => {
    const priced = previewOf([row({ Name: "A", Plan: "Generator", "Special price": "5" })]);
    expect(priced.rows[0].problems[0]).toContain("usage_no_special_price");
    const metered = previewOf([row({ Name: "A", Plan: "Generator", "Meter number": "M-7", "Start reading": "١٥٢٠" })]);
    expect(metered.customers[0].lines[0]).toMatchObject({ meterNumber: "M-7", startReading: 1520 });
  });

  it("TC-CI-23 a negative start reading is refused by the line rule", () => {
    const preview = previewOf([row({ Name: "A", Plan: "Generator", "Start reading": "-3" })]);
    expect(preview.rows[0].problems).toEqual(["errors.start_reading_not_negative"]);
  });

  it("TC-CI-24 an old start date warns how many past months will show unpaid, but still imports", () => {
    const preview = previewOf([row({ Name: "A", Plan: "Internet 10M", "Start date": "01/01/2026" })]);
    expect(preview.customers[0].ready).toBe(true);
    expect(preview.rows[0].warnings[0]).toContain("customer_import.warning.old_start count=9");
  });

  it("TC-CI-25 no start date = today, the same default the form gives", () => {
    const preview = previewOf([row({ Name: "A", Plan: "Internet 10M" })]);
    expect(preview.customers[0].lines[0].startDate).toBe("2026-10-20");
  });

  it("TC-CI-26 regular must be yes or no; blank is yes", () => {
    const preview = previewOf([row({ Name: "A", Regular: "لا" }), row({ Name: "B" }), row({ Name: "C", Regular: "maybe" })]);
    expect(preview.customers.map((c) => c.input.isRegular)).toEqual([false, true, true]);
    expect(preview.customers[2].ready).toBe(false);
  });
});

describe("customer import: limits for the whole file", () => {
  afterEach(() => jest.restoreAllMocks());

  const ready = () =>
    previewOf([
      row({ Name: "A", Plan: "Internet 10M" }),
      row({ Name: "B", Phone: "03111111", Plan: "Internet 10M" }),
      row({ Name: "B", Phone: "03111111", Plan: "TV" }),
    ]).customers.filter((c) => c.ready);

  it("TC-CI-30 a file over the customer limit is refused before anything is written", async () => {
    jest.spyOn(customerService, "countActive").mockResolvedValue(29);
    jest.spyOn(customerPlanService, "countActive").mockResolvedValue(29);
    const error = await customerImportService.assertFits({ customers: 30, plans: 100 }, ready()).catch((e) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error.kind).toBe("customers");
    expect(customerImportService.tooBigMessage(error, ready())).toBe(
      "customer_import.too_big_customers adding=2 room=1 count=29 allowance=30",
    );
  });

  it("TC-CI-31 the plan limit counts every line of every customer in the file", async () => {
    jest.spyOn(customerService, "countActive").mockResolvedValue(0);
    jest.spyOn(customerPlanService, "countActive").mockResolvedValue(28);
    const error = await customerImportService.assertFits({ customers: 100, plans: 30 }, ready()).catch((e) => e);
    expect(error.kind).toBe("plans");
    expect(customerImportService.tooBigMessage(error, ready())).toContain("adding=3 room=2");
  });

  it("TC-CI-32 a file that fits returns the live counts it was checked against", async () => {
    jest.spyOn(customerService, "countActive").mockResolvedValue(10);
    jest.spyOn(customerPlanService, "countActive").mockResolvedValue(12);
    await expect(customerImportService.assertFits({ customers: 30, plans: 30 }, ready())).resolves.toEqual({
      customers: 10,
      plans: 12,
    });
  });
});

describe("customer import: saving in groups", () => {
  beforeEach(() => fakeCustomerImportRepository.reset());

  const manyCustomers = (count: number) =>
    previewOf(Array.from({ length: count }, (_, i) => row({ Name: `C${i}`, Plan: "Internet 10M" }))).customers;

  it("TC-CI-40 every group lands: all imported, with their lines", async () => {
    const customers = manyCustomers(250);
    const progress: number[] = [];
    const run = await customerImportService.importCustomers(customers, "t1", (p) => progress.push(p.done));
    expect(run.importedCustomers).toBe(250);
    expect(run.importedLines).toBe(250);
    expect(run.failure).toBeNull();
    expect(fakeCustomerImportRepository.groups.map((g) => g.customers.length)).toEqual([100, 100, 50]);
    expect(progress).toEqual([0, 100, 200, 250]);
  });

  it("TC-CI-41 a failed group stops the run: earlier groups imported, the rest not", async () => {
    fakeCustomerImportRepository.failOnGroup = 2;
    const customers = manyCustomers(250);
    const run = await customerImportService.importCustomers(customers, "t1", () => undefined);
    const outcomes = customers.map((c) => run.byCustomer.get(c.key)?.outcome);
    expect(outcomes.slice(0, 100).every((o) => o === "imported")).toBe(true);
    expect(outcomes.slice(100, 200).every((o) => o === "failed")).toBe(true);
    expect(outcomes.slice(200).every((o) => o === "not_run")).toBe(true);
    expect(run.importedCustomers).toBe(100);
    expect(run.failure).toBe("server said no");
  });

  it("TC-CI-42 a group whose answer was lost but DID land counts as imported and the run goes on", async () => {
    fakeCustomerImportRepository.failOnGroup = 1;
    fakeCustomerImportRepository.landAnyway = true;
    const customers = manyCustomers(150);
    const run = await customerImportService.importCustomers(customers, "t1", () => undefined);
    expect(run.importedCustomers).toBe(150);
    expect(run.failure).toBeNull();
  });

  it("TC-CI-43 when the lookup fails too, the group is 'not sure', never 'imported'", async () => {
    fakeCustomerImportRepository.failOnGroup = 1;
    fakeCustomerImportRepository.lookupFails = true;
    const customers = manyCustomers(150);
    const run = await customerImportService.importCustomers(customers, "t1", () => undefined);
    expect(run.byCustomer.get(customers[0].key)?.outcome).toBe("unknown");
    expect(run.byCustomer.get(customers[149].key)?.outcome).toBe("not_run");
    expect(run.importedCustomers).toBe(0);
  });

  it("TC-CI-44 the rows-to-fix file is the template layout, holding only what did not go in", async () => {
    fakeCustomerImportRepository.failOnGroup = 2;
    const preview = previewOf([
      ...Array.from({ length: 100 }, (_, i) => row({ Name: `C${i}`, Plan: "Internet 10M" })),
      row({ Name: "Late", Plan: "Internet 10M" }),
      row({ Name: "Bad", Plan: "Gold" }),
    ]);
    const run = await customerImportService.importCustomers(
      preview.customers.filter((c) => c.ready),
      "t1",
      () => undefined,
    );
    const table = rowsToFixTable(preview, run);
    expect(table.headers.slice(0, IMPORT_COLUMNS.length)).toEqual(IMPORT_COLUMNS.map((c) => c.title));
    expect(table.rows.map((r) => r[0])).toEqual(["Late", "Bad"]);
  });
});
