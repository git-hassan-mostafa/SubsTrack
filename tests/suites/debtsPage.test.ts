import type { CustomerDebts } from "@shared/core/types";
import { chargeService } from "@shared/modules/ledger/services/ChargeService";
import {
  DEFAULT_DEBT_HISTORY_FILTERS,
  debtHistoryReadOptions,
} from "@shared/modules/transaction/debts/utils/debtHistory";
import {
  canSaveCustomDebt,
  customDebtBranchId,
  customDebtDraftOf,
  customDebtEdit,
  editedDebtCustomer,
  isBelowCollected,
  isDebtCurrencyLocked,
  isEditableCustomDebt,
  newCustomDebtInput,
} from "@shared/modules/transaction/debts/utils/customDebtForm";
import {
  debtorOwedItems,
  debtorOwedUsd,
  filterDebtors,
} from "@shared/modules/transaction/debts/utils/debtorView";
import { LBP, charge, openItem } from "../helpers/factories";
import { store } from "../helpers/fakeLedger";

// TC-DP-* — the Debts page's shared rules (debtors, history page); TC-CDF-* —
// the custom debt form both apps run. The money checks stay in ChargeService.

beforeEach(() => store.reset());

const USER = { id: "user-1", tenantId: "t1", branchId: "branch-user" };
const ALI = { id: "cust-1", name: "Ali", branchId: "branch-ali" };

function debtor(over: Partial<CustomerDebts> = {}): CustomerDebts {
  return {
    customerId: "cust-1",
    customerName: "Ali Hassan",
    items: [openItem({ kind: "sale", isDebt: true })],
    unpaidMonths: [openItem({ paid: 5, isDebt: false })],
    debtUsd: 20,
    unpaidMonthsUsd: 15,
    oldestDaysLate: 3,
    ...over,
  };
}

describe("debtors", () => {
  it("TC-DP-01 collecting everything pours over the debts AND the part-paid months", () => {
    const d = debtor();
    expect(debtorOwedItems(d)).toEqual([...d.items, ...d.unpaidMonths]);
    expect(debtorOwedUsd(d)).toBe(35);
  });

  it("TC-DP-02 a blank search keeps every debtor", () => {
    const list = [debtor(), debtor({ customerId: "cust-2", customerName: "Sara" })];
    expect(filterDebtors(list, "   ")).toBe(list);
  });

  it("TC-DP-03 the search matches part of the name, any case, trimmed", () => {
    const sara = debtor({ customerId: "cust-2", customerName: "Sara Khalil" });
    const list = [debtor(), sara];
    expect(filterDebtors(list, "  KHAL ")).toEqual([sara]);
    expect(filterDebtors(list, "nobody")).toEqual([]);
  });
});

describe("debt history page", () => {
  it("TC-DP-04 every filter reaches the read, with the branch and no window", () => {
    const options = debtHistoryReadOptions(
      {
        ...DEFAULT_DEBT_HISTORY_FILTERS,
        customerId: "cust-1",
        kind: "manual",
        outcome: "settled",
        sort: "largest",
      },
      "branch-1",
    );
    expect(options).toEqual({
      balanceScope: "settled",
      writeOffScope: "live",
      sortField: "amount",
      sortDirection: "desc",
      branchFilter: "branch-1",
      customerId: "cust-1",
      kinds: ["manual"],
    });
    expect("limit" in options).toBe(false);
    expect("offset" in options).toBe(false);
  });

  it("TC-DP-05 no customer and no kind send nothing for them", () => {
    const options = debtHistoryReadOptions(DEFAULT_DEBT_HISTORY_FILTERS, null);
    expect(options.customerId).toBeUndefined();
    expect(options.kinds).toBeUndefined();
    expect(options.writeOffScope).toBe("any");
  });

  it("TC-DP-06 a page keeps the WHOLE filter's total, not the page's", async () => {
    for (const due of ["2026-01-01", "2026-02-01", "2026-03-01"]) {
      store.seedCharge({ kind: "manual", amount: 10, due_date: due });
    }
    const page = await chargeService.getChargeHistoryPage({ offset: 0, limit: 2 });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.dueDate)).toEqual(["2026-03-01", "2026-02-01"]);
  });

  it("TC-DP-07 a settled bill carries the day its last live payment arrived", async () => {
    const chg = store.seedCharge({ kind: "manual", amount: 20 });
    store.seedCollection(chg.id, 10, { received_at: "2026-02-01T10:00:00.000Z" });
    store.seedCollection(chg.id, 10, { received_at: "2026-02-09T10:00:00.000Z" });
    store.seedCollection(chg.id, 5, {
      received_at: "2026-03-01T10:00:00.000Z",
      voided_at: "2026-03-02T10:00:00.000Z",
    });
    const [row] = (await chargeService.getChargeHistoryPage({ offset: 0, limit: 25 })).rows;
    expect(row.balance).toBe(0);
    expect(row.settledAt).toBe("2026-02-09T10:00:00.000Z");
  });

  it("TC-DP-08 a bill still owing has no settle day", async () => {
    const chg = store.seedCharge({ kind: "manual", amount: 20 });
    store.seedCollection(chg.id, 5);
    const [row] = (await chargeService.getChargeHistoryPage({ offset: 0, limit: 25 })).rows;
    expect(row.balance).toBe(15);
    expect(row.settledAt).toBeNull();
  });

  it("TC-DP-09 an empty page past the end still reports the total", async () => {
    store.seedCharge({ kind: "manual" });
    const page = await chargeService.getChargeHistoryPage({ offset: 25, limit: 25 });
    expect(page).toEqual({ rows: [], total: 1 });
  });
});

describe("custom debt form", () => {
  it("TC-CDF-01 a new debt opens empty, due today", () => {
    expect(customDebtDraftOf(null, "2026-03-15")).toEqual({
      amount: null,
      currencyId: null,
      description: "",
      dueDate: "2026-03-15",
    });
  });

  it("TC-CDF-02 an edit opens on the bill's own values", () => {
    const item = openItem({
      kind: "manual",
      amount: 900000,
      currencyId: "cur-lbp",
      dueDate: "2026-02-10",
      charge: charge({ description: "Router" }),
    });
    expect(customDebtDraftOf(item, "2026-03-15")).toEqual({
      amount: 900000,
      currencyId: "cur-lbp",
      description: "Router",
      dueDate: "2026-02-10",
    });
  });

  it("TC-CDF-03 only a stored hand-typed debt can be edited", () => {
    expect(isEditableCustomDebt(openItem({ kind: "manual" }))).toBe(true);
    expect(isEditableCustomDebt(openItem({ kind: "manual", chargeId: null }))).toBe(false);
    expect(isEditableCustomDebt(openItem({ kind: "sale" }))).toBe(false);
    expect(isEditableCustomDebt(openItem({ kind: "month" }))).toBe(false);
  });

  it("TC-CDF-04 an edit is locked to the bill's own customer and branch", () => {
    const item = openItem({ customerId: "cust-9", customerName: "Sara", branchId: "b-2" });
    expect(editedDebtCustomer(item)).toEqual({ id: "cust-9", name: "Sara", branchId: "b-2" });
  });

  it("TC-CDF-05 any money on the bill locks its currency", () => {
    expect(isDebtCurrencyLocked(0)).toBe(false);
    expect(isDebtCurrencyLocked(0.01)).toBe(true);
  });

  it("TC-CDF-06 the amount may fall to what was collected, never below", () => {
    expect(isBelowCollected(20, 20)).toBe(false);
    expect(isBelowCollected(20 - 1e-9, 20)).toBe(false);
    expect(isBelowCollected(19.99, 20)).toBe(true);
    expect(isBelowCollected(null, 20)).toBe(false);
  });

  it("TC-CDF-07 saving needs a customer and a positive amount above the floor", () => {
    const draft = customDebtDraftOf(null, "2026-03-15");
    expect(canSaveCustomDebt({ ...draft, amount: 10 }, ALI, 0)).toBe(true);
    expect(canSaveCustomDebt({ ...draft, amount: 10 }, null, 0)).toBe(false);
    expect(canSaveCustomDebt(draft, ALI, 0)).toBe(false);
    expect(canSaveCustomDebt({ ...draft, amount: 0 }, ALI, 0)).toBe(false);
    expect(canSaveCustomDebt({ ...draft, amount: 5 }, ALI, 10)).toBe(false);
    expect(canSaveCustomDebt({ ...draft, amount: 10 }, ALI, 10)).toBe(true);
  });

  it("TC-CDF-08 the bill takes the customer's branch, else the user's", () => {
    expect(customDebtBranchId(ALI, USER)).toBe("branch-ali");
    expect(customDebtBranchId({ id: "c", name: "N" }, USER)).toBe("branch-user");
    expect(customDebtBranchId({ id: "c", name: "N", branchId: null }, USER)).toBe("branch-user");
  });

  it("TC-CDF-09 a new debt freezes the picked currency's rate and trims a blank note to null", () => {
    const input = newCustomDebtInput(
      { amount: 900000, currencyId: "cur-lbp", description: "   ", dueDate: "2026-03-15" },
      ALI,
      USER,
      [LBP],
    );
    expect(input).toEqual({
      tenantId: "t1",
      customerId: "cust-1",
      branchId: "branch-ali",
      description: null,
      amount: 900000,
      currencyId: "cur-lbp",
      ratePerUsdSnapshot: 90000,
      dueDate: "2026-03-15",
      recordedByUserId: "user-1",
    });
  });

  it("TC-CDF-10 no currency is USD at rate 1", () => {
    const input = newCustomDebtInput(
      { amount: 25, currencyId: null, description: " Fee ", dueDate: "2026-03-15" },
      ALI,
      USER,
      [LBP],
    );
    expect(input.currencyId).toBeNull();
    expect(input.ratePerUsdSnapshot).toBe(1);
    expect(input.description).toBe("Fee");
  });

  it("TC-CDF-11 an edit in the SAME currency never re-freezes the rate", () => {
    const item = openItem({ kind: "manual", currencyId: "cur-lbp", ratePerUsdSnapshot: 89500 });
    const edit = customDebtEdit(
      { amount: 900000, currencyId: "cur-lbp", description: " Router ", dueDate: "2026-03-01" },
      item,
      [LBP],
    );
    expect(edit).toEqual({ description: "Router", amount: 900000, dueDate: "2026-03-01" });
  });

  it("TC-CDF-12 a currency move sends the currency and its rate together", () => {
    const item = openItem({ kind: "manual", currencyId: null });
    const edit = customDebtEdit(
      { amount: 900000, currencyId: "cur-lbp", description: "", dueDate: "2026-03-01" },
      item,
      [LBP],
    );
    expect(edit.currencyId).toBe("cur-lbp");
    expect(edit.ratePerUsdSnapshot).toBe(90000);
  });

  it("TC-CDF-13 REGRESSION: editing a part-paid debt's note keeps its frozen rate", async () => {
    const chg = store.seedCharge({
      kind: "manual",
      amount: 900000,
      currency_id: "cur-lbp",
      rate_per_usd_snapshot: 89500,
    });
    store.seedCollection(chg.id, 100000, { currency_id: "cur-lbp", rate_per_usd_snapshot: 89500 });
    const item = openItem({
      chargeId: chg.id,
      kind: "manual",
      amount: 900000,
      paid: 100000,
      currencyId: "cur-lbp",
      ratePerUsdSnapshot: 89500,
    });
    const draft = { ...customDebtDraftOf(item, "2026-03-15"), description: "Router", amount: 900000 };
    const saved = await chargeService.updateManualCharge(chg.id, customDebtEdit(draft, item, [LBP]));
    expect(saved.description).toBe("Router");
    expect(saved.ratePerUsdSnapshot).toBe(89500);
  });
});
