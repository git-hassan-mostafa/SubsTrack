jest.mock("@/src/modules/ledger/repository/ChargeRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeChargeRepository,
}));
jest.mock("@/src/modules/ledger/repository/CollectionRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeCollectionRepository,
}));

import { ledgerService } from "@/src/modules/ledger/services/LedgerService";
import { chargeService } from "@/src/modules/ledger/services/ChargeService";
import { mergeOwed } from "@/src/modules/ledger/utils/mergeOwed";
import { keyOf } from "@/src/modules/ledger/utils/waterfall";
import { store } from "../helpers/fakeLedger";
import { customer, line, plan, LBP } from "../helpers/factories";
import { freezeToday, unfreeze } from "../helpers/clock";
import type { Charge, Collection } from "@/src/core/types";
import { buildMonthReceipt } from "../../Portal/src/services/monthReceipt";

// TC-PRT-* — the seam the customer portal stands on. The portal holds its rows
// already (one edge-function response) and has no repository, so it answers
// "what is owed?" with mergeOwed, the pure half of getOwed. If the two ever
// disagree, the portal is quietly showing a customer different money from the
// staff app — which is the one thing this feature must never do.

const P = plan({ id: "p1", price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: "line-1", startDate: "2026-01-01", planId: "p1", plan: P });
const C = customer({ id: "cust-1", customerPlans: [L] });

const args = {
  customer: C,
  lines: [L],
  skips: [],
  unpaidRule: "month_start" as const,
  currencies: [LBP],
};

// Exactly what the portal does: take the rows it was handed, run the same merge.
async function mergedFromRows() {
  const stored = await chargeService.getOpenCharges({ customerId: C.id });
  const billsByLine = await chargeService.getMonthBillsForLines([L.id]);
  return mergeOwed({ ...args, stored, billsByLine });
}

function sameAnswer(
  a: Awaited<ReturnType<typeof mergedFromRows>>,
  b: Awaited<ReturnType<typeof mergedFromRows>>,
) {
  expect(a.map(keyOf)).toEqual(b.map(keyOf));
  expect(a.map((i) => i.balance)).toEqual(b.map((i) => i.balance));
  expect(a.map((i) => i.currencyId)).toEqual(b.map((i) => i.currencyId));
}

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe("mergeOwed answers exactly what getOwed answers", () => {
  it("TC-PRT-01 agrees when every month is still virtual", async () => {
    const viaRows = await mergedFromRows();
    sameAnswer(viaRows, await ledgerService.getOwed(args));

    // Asserted absolutely, not just against getOwed: comparing two paths that
    // share an implementation cannot notice a bug they now share. Jan/Feb/Mar
    // of a line starting 2026-01-01, with today frozen at 2026-03-15.
    expect(viaRows.map((i) => i.billingMonth)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(viaRows.every((i) => i.balance === 20)).toBe(true);
  });

  it("TC-PRT-02 agrees after a partial payment, and keeps the remainder", async () => {
    store.seedCharge({ id: "chg-jan", billing_month: "2026-01-01" });
    store.seedCollection("chg-jan", 5);

    const viaRows = await mergedFromRows();
    sameAnswer(viaRows, await ledgerService.getOwed(args));

    // Money reached January, so that month keeps its own balance rather than
    // being re-priced as a virtual month (gotcha #106b).
    const january = viaRows.find((i) => i.billingMonth === "2026-01-01");
    expect(january?.balance).toBe(15);
    expect(january?.paid).toBe(5);
  });

  it("TC-PRT-03 agrees when a hand-over is voided, leaving the month owed again", async () => {
    store.seedCharge({ id: "chg-jan", billing_month: "2026-01-01" });
    store.seedCollection("chg-jan", 20, {
      voided_at: "2026-02-02T10:00:00.000Z",
      voided_by: "user-1",
      void_reason: "wrong customer",
    });

    const viaRows = await mergedFromRows();
    sameAnswer(viaRows, await ledgerService.getOwed(args));

    // An emptied bill reads identically to a month never touched: the grid and
    // the owed list key off MONEY, never off a row existing (gotcha #106).
    const january = viaRows.find((i) => i.billingMonth === "2026-01-01");
    expect(january?.paid).toBe(0);
    expect(january?.balance).toBe(20);
  });
});

describe("what the portal renders", () => {
  it("TC-PRT-04 lists what is owed oldest first, the order money is applied in", async () => {
    const owed = await mergedFromRows();
    const months = owed.map((i) => i.billingMonth);
    expect(months).toEqual([...months].sort());
  });

  it("TC-PRT-05 never converts across currencies when totalling", async () => {
    const owed = await mergedFromRows();
    // One line, one price, one currency: every row must carry that same
    // currency, so a per-currency total can never silently mix two.
    expect(new Set(owed.map((i) => i.currencyId)).size).toBe(1);
  });
});

describe("the receipt behind a month cell", () => {
  const monthCharge = {
    id: "charge-jan",
    amount: 20,
    currencyId: null,
  } as unknown as Charge;

  const handOver = (
    id: string,
    slices: { chargeId: string; amount: number }[],
  ) =>
    ({
      id,
      currencyId: null,
      items: slices.map((slice, index) => ({
        id: `${id}-${index}`,
        chargeId: slice.chargeId,
        amount: slice.amount,
      })),
    }) as unknown as Collection;

  it("TC-PRT-06 sums EVERY hand-over that reached the month, not just the first", () => {
    const receipt = buildMonthReceipt(monthCharge, [
      handOver("c1", [{ chargeId: "charge-jan", amount: 8 }]),
      handOver("c2", [{ chargeId: "charge-jan", amount: 12 }]),
    ]);

    expect(receipt.payments.map((p) => p.collection.id)).toEqual(["c1", "c2"]);
    expect(receipt.paid).toBe(20);
    expect(receipt.remaining).toBe(0);
  });

  it("TC-PRT-07 counts only the slice that paid THIS bill, never the hand-over total", () => {
    // One hand-over settling two bills: the receipt for January must show 8,
    // not the 30 that physically changed hands (gotcha #107).
    const receipt = buildMonthReceipt(monthCharge, [
      handOver("c1", [
        { chargeId: "charge-jan", amount: 8 },
        { chargeId: "charge-feb", amount: 22 },
      ]),
    ]);

    expect(receipt.paid).toBe(8);
    expect(receipt.remaining).toBe(12);
  });

  it("TC-PRT-08 leaves out a hand-over that paid nothing towards this month", () => {
    const receipt = buildMonthReceipt(monthCharge, [
      handOver("c1", [{ chargeId: "charge-feb", amount: 20 }]),
    ]);

    expect(receipt.payments).toEqual([]);
    expect(receipt.paid).toBe(0);
    expect(receipt.remaining).toBe(20);
  });
});
