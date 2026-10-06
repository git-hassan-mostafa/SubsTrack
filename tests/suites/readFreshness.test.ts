import type { AuthUser, DebtsView, ExpensesView } from "@shared/core/types";
import productService from "@shared/modules/admin/products/services/ProductService";
import { ledgerService } from "@shared/modules/ledger/services/LedgerService";
import expenseService from "@shared/modules/transaction/expenses/services/ExpenseService";
import { useExpenseStore } from "@shared/modules/transaction/expenses/state/expenseStore";
import walletService from "@shared/modules/wallet/services/WalletService";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { isFreshRead, readStamp } from "@shared/shared/lib/readStamp";
import { getStore } from "@shared/state/globalStore";

// TC-RF-* — Debts, Wallets and Expenses keep their read across visits until what they show moves.

const admin = { id: "a3", tenantId: "t1", role: "admin", branchId: null } as AuthUser;

const debtsView: DebtsView = {
  customers: [],
  summary: { totalUsd: 0, monthsUsd: 0, salesUsd: 0, manualUsd: 0, customerCount: 0, writtenOffUsd: 0 },
};

const expensesView: ExpensesView = { items: [], summary: { totalUsd: 0, manualUsd: 0, stockUsd: 0 } };

const bumpOwed = () => getStore().getState().ledger.markOwedChanged();

beforeEach(() => {
  const state = getStore().getState();
  getStore().setState({ auth: { ...state.auth, user: admin } });
  state.ledger.reset();
  useWalletStore.getState().reset();
  useExpenseStore.getState().reset();
});
afterEach(() => jest.restoreAllMocks());

describe("read stamp", () => {
  it("TC-RF-01 a read is fresh only for the same branch and the same change counter", () => {
    const stamp = readStamp("b1", 4);
    expect(isFreshRead(stamp, "b1", 4)).toBe(true);
    expect(isFreshRead(stamp, "b2", 4)).toBe(false);
    expect(isFreshRead(stamp, "b1", 5)).toBe(false);
    expect(isFreshRead(null, "b1", 4)).toBe(false);
    expect(isFreshRead(readStamp(null, 0), null, 0)).toBe(true);
  });
});

describe("debts", () => {
  it("TC-RF-02 reopening reads nothing until money moves or the branch changes", async () => {
    const reads = jest.spyOn(ledgerService, "getDebtsView").mockResolvedValue(debtsView);
    const { ensureDebts } = getStore().getState().ledger;
    await ensureDebts(null);
    await ensureDebts(null);
    expect(reads).toHaveBeenCalledTimes(1);
    bumpOwed();
    await ensureDebts(null);
    expect(reads).toHaveBeenCalledTimes(2);
    await ensureDebts("b1");
    expect(reads).toHaveBeenCalledTimes(3);
    expect(reads).toHaveBeenLastCalledWith("b1");
  });

  it("TC-RF-03 a payment saved while the read was on its way leaves the list stale", async () => {
    const reads = jest.spyOn(ledgerService, "getDebtsView").mockImplementationOnce(async () => {
      bumpOwed();
      return debtsView;
    });
    reads.mockResolvedValue(debtsView);
    const { ensureDebts } = getStore().getState().ledger;
    await ensureDebts(null);
    await ensureDebts(null);
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("TC-RF-04 a failed read is tried again on the next open", async () => {
    const reads = jest.spyOn(ledgerService, "getDebtsView").mockRejectedValueOnce(new Error("network"));
    reads.mockResolvedValue(debtsView);
    const { ensureDebts } = getStore().getState().ledger;
    await ensureDebts(null);
    expect(getStore().getState().ledger.error).toBe("network");
    await ensureDebts(null);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(getStore().getState().ledger.debts).toBe(debtsView);
  });
});

describe("wallets", () => {
  it("TC-RF-05 the wallet list re-reads only after cash was collected or voided", async () => {
    const reads = jest.spyOn(walletService, "getWalletsView").mockResolvedValue([]);
    const { ensureWallets } = useWalletStore.getState();
    await ensureWallets();
    await ensureWallets();
    expect(reads).toHaveBeenCalledTimes(1);
    bumpOwed();
    await ensureWallets();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("TC-RF-06 signing out forgets the read, so the next user reads their own", async () => {
    const reads = jest.spyOn(walletService, "getWalletsView").mockResolvedValue([]);
    await useWalletStore.getState().ensureWallets();
    useWalletStore.getState().reset();
    await useWalletStore.getState().ensureWallets();
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

describe("expenses", () => {
  it("TC-RF-07 a stock entry dates the expenses list; a money write does not", async () => {
    const reads = jest.spyOn(expenseService, "getExpensesView").mockResolvedValue(expensesView);
    jest.spyOn(productService, "addStock").mockResolvedValue(5);
    const { ensureExpenses } = useExpenseStore.getState();
    await ensureExpenses();
    bumpOwed();
    await ensureExpenses();
    expect(reads).toHaveBeenCalledTimes(1);
    await getStore().getState().products.addStock("p1", "t1", 5, null, "a3", null);
    await ensureExpenses();
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it("TC-RF-08 switching branch re-reads the window for the new branch", async () => {
    const reads = jest.spyOn(expenseService, "getExpensesView").mockResolvedValue(expensesView);
    await useExpenseStore.getState().ensureExpenses();
    const state = getStore().getState();
    getStore().setState({ auth: { ...state.auth, user: { ...admin, branchId: "b1" } } });
    await useExpenseStore.getState().ensureExpenses();
    expect(reads).toHaveBeenCalledTimes(2);
    expect(reads.mock.calls[1][0]).toMatchObject({ branchFilter: "b1" });
  });
});
