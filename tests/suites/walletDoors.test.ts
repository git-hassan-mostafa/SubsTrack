import type { AuthUser, UserWallet, WalletItem } from "@shared/core/types";
import { configureShared, runtime, type Runtime } from "@shared/core/runtime/runtime";
import { inChunks } from "@shared/core/utils/chunk";
import { CollectionRepository } from "@shared/modules/ledger/repository/CollectionRepository";
import walletService from "@shared/modules/wallet/services/WalletService";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import {
  cashOnHandUsd,
  walletActConfirm,
  walletActionMode,
  walletItemMenuItems,
  walletMenuItems,
  walletSelectionItems,
} from "@shared/modules/wallet/utils/walletView";
import {
  filterWalletItems,
  NO_WALLET_FILTER,
  walletCustomerOptions,
} from "@shared/modules/wallet/utils/walletItemFilter";
import { getStore } from "@shared/state/globalStore";

// TC-WD-* — the wallet doors both apps run, and the custody reads/writes under them.

type Step = [string, unknown[]];
type Answer = (steps: Step[]) => { data: unknown; error: unknown; count?: number | null };

class RecordingSupabase {
  readonly requests: { table: string; steps: Step[] }[] = [];

  constructor(private readonly answer: Answer) {}

  from(table: string) {
    const steps: Step[] = [];
    this.requests.push({ table, steps });
    const answer = this.answer;
    const builder: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(answer(steps)).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            steps.push([String(prop), args]);
            return builder;
          };
        },
      },
    );
    return builder;
  }
}

const argsOf = (steps: Step[], name: string) => steps.find(([op]) => op === name)?.[1];

const wallet = (over: Partial<UserWallet> = {}): UserWallet => ({
  holderUserId: "u1",
  holderName: "Sami",
  active: true,
  byCurrency: [],
  itemCount: 1,
  totalUsd: 10,
  isSelf: false,
  receiveBlock: null,
  canCloseOut: false,
  ...over,
});

const item = (over: Partial<WalletItem> = {}): WalletItem => ({
  id: "c1",
  source: "month",
  collectorUserId: "u1",
  collectorName: null,
  holderUserId: "u1",
  customerId: "k1",
  customerName: "Rami",
  label: null,
  amount: 10,
  currencyId: null,
  ratePerUsdSnapshot: 1,
  date: "2026-03-01T10:00:00",
  ...over,
});

describe("wallet doors", () => {
  it("TC-WD-01 the rights the service sent decide the door, never the role", () => {
    expect(walletActionMode(wallet())).toBe("receive");
    expect(walletActionMode(wallet({ receiveBlock: "self", canCloseOut: true }))).toBe("close_out");
    expect(walletActionMode(wallet({ receiveBlock: "self" }))).toBe("view");
    expect(walletActionMode(wallet({ receiveBlock: "branch" }))).toBe("view");
    expect(walletActionMode(null)).toBe("view");
  });

  it("TC-WD-02 a wallet you cannot take says why instead of an empty menu", () => {
    const [blocked] = walletMenuItems(wallet({ receiveBlock: "branch" }));
    expect(blocked).toMatchObject({
      key: "blocked",
      disabled: true,
      labelKey: "wallet.cannot_receive_branch",
    });
    expect(walletMenuItems(wallet())[0]).toMatchObject({
      key: "act_all",
      labelKey: "wallet.receive_all",
    });
    expect(
      walletMenuItems(wallet({ receiveBlock: "self", canCloseOut: true }))[0].labelKey,
    ).toBe("wallet.close_out_all");
  });

  it("TC-WD-03 a look-only wallet still opens a payment, but moves nothing", () => {
    expect(walletItemMenuItems("view").map((m) => m.key)).toEqual(["details"]);
    expect(walletSelectionItems("view")).toEqual([]);
    expect(walletItemMenuItems("receive").map((m) => m.key)).toEqual(["details", "act"]);
    expect(walletSelectionItems("close_out")[0].labelKey).toBe("wallet.close_out");
  });

  it("TC-WD-04 the confirm names what moves: one, several, or a whole wallet", () => {
    expect(walletActConfirm("receive", { count: 1 }).messageKey).toBe("wallet.receive_confirm_message");
    expect(walletActConfirm("receive", { count: 3 })).toMatchObject({
      messageKey: "wallet.receive_selected_confirm_message",
      values: { count: 3 },
    });
    expect(walletActConfirm("receive", { holderName: "Sami" })).toMatchObject({
      confirmKey: "wallet.receive_all",
      values: { name: "Sami" },
    });
    expect(walletActConfirm("close_out", { count: 2 }).confirmKey).toBe("wallet.close_out");
    expect(walletActConfirm("close_out", { holderName: "Me" }).confirmKey).toBe("wallet.close_out_all");
  });

  it("TC-WD-05 cash on hand is every wallet's USD added up", () => {
    expect(cashOnHandUsd([wallet({ totalUsd: 10.5 }), wallet({ totalUsd: 4.5 })])).toBe(15);
    expect(cashOnHandUsd([])).toBe(0);
  });
});

describe("wallet item filters", () => {
  const items = [
    item({ id: "a", date: "2026-03-01T00:30:00", customerId: "k1", customerName: "Rami" }),
    item({ id: "b", date: "2026-03-02T23:30:00", source: "sale", customerId: "k2", customerName: "Lina" }),
    item({ id: "c", date: "2026-03-05T12:00:00", customerId: null, customerName: null }),
  ];
  const ids = (rows: WalletItem[]) => rows.map((r) => r.id);

  it("TC-WD-06 a day range counts the LOCAL day each row shows", () => {
    expect(ids(filterWalletItems(items, { ...NO_WALLET_FILTER, fromDay: "2026-03-01", toDay: "2026-03-02" }))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(filterWalletItems(items, { ...NO_WALLET_FILTER, fromDay: "2026-03-03" }))).toEqual(["c"]);
  });

  it("TC-WD-07 customer and type narrow together; no filter keeps the same list", () => {
    expect(ids(filterWalletItems(items, { ...NO_WALLET_FILTER, source: "sale" }))).toEqual(["b"]);
    expect(ids(filterWalletItems(items, { ...NO_WALLET_FILTER, customerId: "k1", source: "sale" }))).toEqual([]);
    expect(filterWalletItems(items, NO_WALLET_FILTER)).toBe(items);
  });

  it("TC-WD-08 the customer choices are each named customer once; walk-ins have none", () => {
    expect(walletCustomerOptions([...items, item({ id: "d" })])).toEqual([
      { value: "k1", label: "Rami" },
      { value: "k2", label: "Lina" },
    ]);
  });
});

describe("custody reads and writes", () => {
  let saved: Runtime;
  const use = (fake: RecordingSupabase) =>
    configureShared({ ...saved, supabase: fake as unknown as Runtime["supabase"] });

  beforeEach(() => {
    saved = runtime();
  });
  afterEach(() => configureShared(saved));

  it("TC-WD-09 inChunks keeps every item once, in order", () => {
    expect(inChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inChunks([], 2)).toEqual([]);
  });

  it("TC-WD-10 a big receive moves in id chunks, each guarded on holder and not voided", async () => {
    const fake = new RecordingSupabase(() => ({ data: null, error: null }));
    use(fake);
    const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
    await new CollectionRepository().transferCustody(ids, "u1", "a3", "a3");
    expect(fake.requests.map((r) => (argsOf(r.steps, "in")?.[1] as string[]).length)).toEqual([100, 100, 50]);
    expect(fake.requests.flatMap((r) => (argsOf(r.steps, "in")?.[1] as string[]))).toEqual(ids);
    for (const { steps } of fake.requests) {
      expect(argsOf(steps, "eq")).toEqual(["held_by_user_id", "u1"]);
      expect(argsOf(steps, "is")).toEqual(["voided_at", null]);
      expect(argsOf(steps, "update")?.[0]).toEqual({
        held_by_user_id: "a3",
        remitted_at: null,
        remitted_by: null,
      });
    }
  });

  it("TC-WD-11 closing out empties the wallet and stamps who banked it", async () => {
    const fake = new RecordingSupabase(() => ({ data: null, error: null }));
    use(fake);
    await new CollectionRepository().transferCustody(["c1"], "a3", null, "a3");
    expect(argsOf(fake.requests[0].steps, "update")?.[0]).toMatchObject({
      held_by_user_id: null,
      remitted_by: "a3",
    });
  });

  it("TC-WD-12 every held hand-over is read, past the 1000-row cap", async () => {
    const total = 2300;
    const fake = new RecordingSupabase((steps) => {
      const [from, to] = argsOf(steps, "range") as [number, number];
      const end = Math.min(to, from + 999, total - 1);
      const data = Array.from({ length: end - from + 1 }, (_, i) => ({
        id: `c${from + i}`,
        collection_items: [],
        customers: null,
      }));
      return { data, error: null, count: total };
    });
    use(fake);
    const rows = await new CollectionRepository().findAllHeld(null);
    expect(rows).toHaveLength(total);
    expect(new Set(rows.map((r) => r.id)).size).toBe(total);
    const first = fake.requests[0].steps;
    expect(argsOf(first, "not")).toEqual(["held_by_user_id", "is", null]);
    expect(argsOf(first, "is")).toEqual(["voided_at", null]);
    expect(argsOf(first, "order")).toEqual(["id"]);
  });
});

describe("wallet store", () => {
  const admin = { id: "a3", role: "admin", branchId: null } as AuthUser;

  beforeEach(() => {
    const state = getStore().getState();
    getStore().setState({ auth: { ...state.auth, user: admin } });
    useWalletStore.getState().reset();
  });
  afterEach(() => jest.restoreAllMocks());

  it("TC-WD-13 a failed receive still re-reads, so part-moved cash shows as it is", async () => {
    const reads = jest.spyOn(walletService, "getWalletsView").mockResolvedValue([wallet()]);
    jest.spyOn(walletService, "receiveFrom").mockRejectedValue(new Error("network"));
    await expect(useWalletStore.getState().receiveFrom("u1", ["c1"])).rejects.toThrow("network");
    expect(reads).toHaveBeenCalledTimes(1);
    expect(useWalletStore.getState().error).toBe("network");
    expect(useWalletStore.getState().loaded).toBe(true);
  });
});
