import type { Currency, ExpenseItem, ExpenseSummary } from "@shared/core/types";
import {
  canSaveExpense,
  expenseDayToIso,
  expenseDraftOf,
  newExpenseInput,
} from "@shared/modules/transaction/expenses/utils/expenseForm";
import {
  expenseListView,
  expenseMenuItems,
  filterExpenses,
} from "@shared/modules/transaction/expenses/utils/expenseList";
import { storedExpenseId } from "@shared/modules/transaction/expenses/utils/mapper";
import { outflowLabel, outflowPair } from "@shared/modules/transaction/expenses/utils/outflow";

const LBP: Currency = {
  id: "lbp",
  tenantId: "t1",
  code: "LBP",
  name: "Lebanese pound",
  symbol: "LL",
  ratePerUsd: 90000,
  decimals: 0,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const USER = { id: "u1", tenantId: "t1", branchId: null };

function item(over: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "exp:e1",
    source: "manual",
    category: "rent",
    label: "Shop rent",
    amount: 100,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    date: "2026-02-10T12:00:00.000Z",
    branchId: null,
    recordedByUserId: "u1",
    productId: null,
    canVoid: true,
    ...over,
  };
}

const stock = (over: Partial<ExpenseItem> = {}) =>
  item({
    id: "stock:m1",
    source: "stock",
    category: "stock",
    label: "Router ×10",
    productId: "p1",
    canVoid: false,
    ...over,
  });

const summaryOf = (items: ExpenseItem[]): ExpenseSummary => {
  const usd = (rows: ExpenseItem[]) => rows.reduce((s, r) => s + r.amount / r.ratePerUsdSnapshot, 0);
  const stockUsd = usd(items.filter((i) => i.source === "stock"));
  const manualUsd = usd(items.filter((i) => i.source === "manual"));
  return { totalUsd: stockUsd + manualUsd, stockUsd, manualUsd };
};

const ALL = { search: "", category: "all" as const };

describe("expense form", () => {
  it("TC-EX-01 a new expense starts in the user's own branch, else company-wide", () => {
    expect(expenseDraftOf("2026-02-10", { branchId: "b1" }).branchId).toBe("b1");
    expect(expenseDraftOf("2026-02-10", { branchId: null }).branchId).toBeNull();
    expect(expenseDraftOf("2026-02-10", null).day).toBe("2026-02-10");
  });

  it("TC-EX-02 only a positive amount can be saved", () => {
    expect(canSaveExpense({ amount: null })).toBe(false);
    expect(canSaveExpense({ amount: 0 })).toBe(false);
    expect(canSaveExpense({ amount: -5 })).toBe(false);
    expect(canSaveExpense({ amount: 0.01 })).toBe(true);
  });

  it("TC-EX-03 the picked day is stored at local midday, so it stays that calendar day", () => {
    const at = new Date(expenseDayToIso("2026-01-31"));
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours()]).toEqual([2026, 0, 31, 12]);
  });

  it("TC-EX-04 the saved input carries the typed currency, a trimmed note and the picked day", () => {
    const draft = { ...expenseDraftOf("2026-02-10", USER), amount: 450000, currencyId: "lbp", description: "  Fuel  " };
    const input = newExpenseInput(draft, USER, [LBP]);
    expect(input.currency).toBe(LBP);
    expect(input.amount).toBe(450000);
    expect(input.description).toBe("Fuel");
    expect(input.incurredAt).toBe(expenseDayToIso("2026-02-10"));
    expect(input).toMatchObject({ recordedByUserId: "u1", tenantId: "t1", branchId: null });
    const usd = newExpenseInput({ ...draft, currencyId: null, description: " " }, USER, [LBP]);
    expect(usd.currency).toBeNull();
    expect(usd.description).toBeNull();
  });
});

describe("expense list", () => {
  it("TC-EX-05 the whole window shows the stored summary and its stock/other split", () => {
    const items = [item(), stock({ amount: 35 })];
    const view = expenseListView(items, summaryOf(items), ALL);
    expect(view.filtered).toBe(false);
    expect(view.totalUsd).toBeCloseTo(135);
    expect(view.breakdown).toEqual({ stockUsd: 35, manualUsd: 100 });
  });

  it("TC-EX-06 a filtered view sums only its rows, in USD at each row's frozen rate, with no split", () => {
    const items = [
      item(),
      item({ id: "exp:e2", category: "fuel", label: "Fuel", amount: 450000, currencyId: "lbp", ratePerUsdSnapshot: 90000 }),
      stock({ amount: 35 }),
    ];
    const view = expenseListView(items, summaryOf(items), { search: "", category: "fuel" });
    expect(view.rows.map((r) => r.id)).toEqual(["exp:e2"]);
    expect(view.totalUsd).toBeCloseTo(5);
    expect(view.breakdown).toBeNull();
  });

  it("TC-EX-07 a month of stock credits nets negative and still shows its split", () => {
    const items = [item(), stock({ amount: -20 })];
    expect(expenseListView(items, summaryOf(items), ALL).breakdown).toEqual({ stockUsd: -20, manualUsd: 100 });
  });

  it("TC-EX-08 only one half in the window → no split", () => {
    const items = [item(), item({ id: "exp:e2" })];
    expect(expenseListView(items, summaryOf(items), ALL).breakdown).toBeNull();
  });

  it("TC-EX-09 search matches the label, ignoring case and spaces", () => {
    const items = [item(), item({ id: "exp:e2", label: "Generator fuel" })];
    expect(filterExpenses(items, { search: "  FUEL ", category: "all" }).map((r) => r.id)).toEqual(["exp:e2"]);
  });

  it("TC-EX-10 a typed expense can be removed; a stock row only opens its product", () => {
    expect(expenseMenuItems(item()).map((m) => m.key)).toEqual(["remove"]);
    expect(expenseMenuItems(stock()).map((m) => m.key)).toEqual(["product"]);
    expect(expenseMenuItems(stock({ productId: null }))).toEqual([]);
  });

  it("TC-EX-11 removing a row voids the stored expense by its own id", () => {
    expect(storedExpenseId(item({ id: "exp:abc" }))).toBe("abc");
  });

  it("TC-EX-12 a stock credit prints unsigned, like any other figure", () => {
    expect(outflowLabel(-35)).toBe(outflowLabel(35));
    expect(outflowPair(-450000, LBP, null)).toEqual(outflowPair(450000, LBP, null));
  });
});
