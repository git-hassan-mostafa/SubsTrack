import {
  collectInputsFor,
  poolGroups,
  receivedAtIso,
  singleCollectPlan,
  singleGroups,
} from "@shared/modules/ledger/utils/collectForm";
import { groupOwedByCurrency, planCollection } from "@shared/modules/ledger/utils/currencyGroups";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import type { Currency } from "@shared/core/types";
import { store } from "../helpers/fakeLedger";
import { LBP, openItem } from "../helpers/factories";

// TC-CX-* — the collect form both apps share: the single-bill door (a priced
// bill or an OPEN item whose typed month amount is the bill), the per-currency
// groups a Save writes, and the hand-overs they become.

beforeEach(() => store.reset());

const currencies: Currency[] = [LBP];
const author = {
  tenantId: "t1",
  receivedByUserId: "user-1",
  customerId: "cust-1",
  fallbackBranchId: "branch-user",
};

describe("singleCollectPlan", () => {
  const bill = () => openItem({ chargeId: "chg-1", amount: 30, paid: 10 });

  it("TC-CX-01 a priced bill is capped at what it still owes", () => {
    const plan = singleCollectPlan({ item: bill(), openBill: null, currencyId: null, ratePerUsd: 1, amount: 20 });
    expect(plan.max).toBe(20);
    expect(plan.lines).toEqual([{ item: bill(), amount: 20, settles: true }]);
    expect(plan.overpaying).toBe(false);
    expect(plan.partial).toBe(false);
  });

  it("TC-CX-02 less than owed leaves the rest owed", () => {
    const plan = singleCollectPlan({ item: bill(), openBill: null, currencyId: null, ratePerUsd: 1, amount: 5 });
    expect(plan.lines[0].amount).toBe(5);
    expect(plan.lines[0].settles).toBe(false);
    expect(plan.partial).toBe(true);
  });

  it("TC-CX-03 more than owed is an overpay and never books the excess", () => {
    const plan = singleCollectPlan({ item: bill(), openBill: null, currencyId: null, ratePerUsd: 1, amount: 25 });
    expect(plan.overpaying).toBe(true);
    expect(plan.lines[0].amount).toBe(20);
  });

  it("TC-CX-04 nothing typed means nothing to save", () => {
    const plan = singleCollectPlan({ item: bill(), openBill: null, currencyId: null, ratePerUsd: 1, amount: null });
    expect(plan.lines).toEqual([]);
    expect(plan.overpaying).toBe(false);
  });

  it("TC-CX-05 an OPEN item's typed month amount becomes the bill, in the picked currency", () => {
    const open = openItem({ chargeId: null, amount: 0, openAmount: true });
    const plan = singleCollectPlan({
      item: open,
      openBill: 1_500_000,
      currencyId: LBP.id,
      ratePerUsd: LBP.ratePerUsd,
      amount: 1_000_000,
    });
    expect(plan.target.amount).toBe(1_500_000);
    expect(plan.target.balance).toBe(1_500_000);
    expect(plan.target.currencyId).toBe(LBP.id);
    expect(plan.target.ratePerUsdSnapshot).toBe(LBP.ratePerUsd);
    expect(plan.max).toBe(1_500_000);
    expect(plan.lines[0]).toMatchObject({ amount: 1_000_000, settles: false });
  });

  it("TC-CX-06 an OPEN item with no month amount has nothing to collect against", () => {
    const open = openItem({ chargeId: null, amount: 0, openAmount: true });
    const plan = singleCollectPlan({ item: open, openBill: null, currencyId: null, ratePerUsd: 1, amount: 10 });
    expect(plan.max).toBe(0);
    expect(plan.lines).toEqual([]);
    expect(plan.overpaying).toBe(true);
  });

  it("TC-CX-07 the single group carries the LIVE rate and the amount actually taken", () => {
    const lbpBill = openItem({ chargeId: "chg-l", amount: 900_000, currencyId: LBP.id, ratePerUsdSnapshot: 45_000 });
    const plan = singleCollectPlan({
      item: lbpBill,
      openBill: null,
      currencyId: LBP.id,
      ratePerUsd: LBP.ratePerUsd,
      amount: 900_000,
    });
    const [group] = singleGroups(plan, LBP.id, LBP.ratePerUsd);
    expect(group.currencyId).toBe(LBP.id);
    expect(group.ratePerUsdSnapshot).toBe(90_000);
    expect(group.amount).toBe(900_000);
  });
});

describe("poolGroups + collectInputsFor", () => {
  const usd = () => openItem({ chargeId: "chg-usd", amount: 50, branchId: "branch-bill" });
  const lbp = () =>
    openItem({
      chargeId: "chg-lbp",
      amount: 2_000_000,
      currencyId: LBP.id,
      ratePerUsdSnapshot: LBP.ratePerUsd,
      branchId: null,
    });

  const plansFor = (amounts: [string, number | null][]) =>
    planCollection(groupOwedByCurrency([usd(), lbp()], currencies), new Map(amounts), new Set());

  it("TC-CX-08 only funded currencies become a group, each in its own units", () => {
    const funded = plansFor([["__usd__", 30], [LBP.id, null]]).filter((p) => p.lines.length > 0);
    const groups = poolGroups(funded);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ currencyId: null, amount: 30, ratePerUsdSnapshot: 1 });
  });

  it("TC-CX-09 a two-currency Save is two hand-overs, never one converted total", () => {
    const funded = plansFor([["__usd__", 50], [LBP.id, 2_000_000]]);
    const inputs = collectInputsFor(
      { receivedAt: "2026-03-10T10:00:00.000Z", notes: "door", groups: poolGroups(funded) },
      author,
    );
    expect(inputs).toHaveLength(2);
    expect(inputs.map((i) => [i.currencyId, i.amount]).sort()).toEqual(
      [[LBP.id, 2_000_000], [null, 50]].sort(),
    );
    for (const input of inputs) {
      expect(input.receivedAt).toBe("2026-03-10T10:00:00.000Z");
      expect(input.notes).toBe("door");
      expect(input.customerId).toBe("cust-1");
      expect(input.receivedByUserId).toBe("user-1");
    }
  });

  it("TC-CX-10 the hand-over takes the bill's branch, and the user's when the bill has none", () => {
    const funded = plansFor([["__usd__", 50], [LBP.id, 2_000_000]]);
    const inputs = collectInputsFor({ receivedAt: "x", notes: null, groups: poolGroups(funded) }, author);
    expect(inputs.find((i) => i.currencyId === null)!.branchId).toBe("branch-bill");
    expect(inputs.find((i) => i.currencyId === LBP.id)!.branchId).toBe("branch-user");
  });

  it("TC-CX-11 a line settles only when it takes the whole balance", () => {
    const funded = plansFor([["__usd__", 20], [LBP.id, 2_000_000]]);
    const inputs = collectInputsFor({ receivedAt: "x", notes: null, groups: poolGroups(funded) }, author);
    expect(inputs.find((i) => i.currencyId === null)!.lines[0].settles).toBe(false);
    expect(inputs.find((i) => i.currencyId === LBP.id)!.lines[0].settles).toBe(true);
  });

  it("TC-CX-12 what the form builds passes the service's own checks and is saved", async () => {
    store.seedCharge({ id: "chg-usd", amount: 50, currency_id: null });
    store.seedCharge({
      id: "chg-lbp",
      amount: 2_000_000,
      currency_id: LBP.id,
      rate_per_usd_snapshot: LBP.ratePerUsd,
    });
    const funded = plansFor([["__usd__", 50], [LBP.id, 1_000_000]]);
    const inputs = collectInputsFor(
      { receivedAt: "2026-03-10T10:00:00.000Z", notes: null, groups: poolGroups(funded) },
      author,
    );
    const { collections, failed } = await collectionService.collectMulti(inputs);
    expect(failed).toBeNull();
    expect(collections).toHaveLength(2);
  });
});

describe("receivedAtIso", () => {
  it("TC-CX-13 an untouched date field records the exact moment of saving", () => {
    const before = Date.now();
    const iso = receivedAtIso("2020-01-01 09:00", false);
    expect(new Date(iso).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("TC-CX-14 a picked date and time is taken as local time", () => {
    expect(receivedAtIso("2026-03-05 14:30", true)).toBe(new Date("2026-03-05T14:30:00").toISOString());
  });
});
