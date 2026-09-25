jest.mock("@/src/modules/ledger/repository/ChargeRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeChargeRepository,
}));
jest.mock("@/src/modules/ledger/repository/CollectionRepository", () => ({
  __esModule: true,
  default: require("../helpers/fakeLedger").fakeCollectionRepository,
}));

import { collectionService } from "@/src/modules/ledger/services/CollectionService";
import type { CollectInput } from "@/src/modules/ledger/services/CollectionService";
import type { AllocationLine, OpenItem } from "@/src/core/types";
import { deterministicId } from "@/src/core/offline/ids";
import {
  hasClosedBill,
  withoutCollection,
} from "@/src/modules/ledger/utils/correction";
import {
  custodyOf,
  receivedCustody,
  sharedCustody,
} from "@/src/modules/wallet/utils/custodyValues";
import { fakeChargeRepository, store } from "../helpers/fakeLedger";
import { charge, collectionItem, openItem } from "../helpers/factories";

beforeEach(() => store.reset());

const lineOf = (item: OpenItem, amount: number): AllocationLine => ({
  item,
  amount,
  settles: amount >= item.balance,
});

function input(over: Partial<CollectInput> = {}): CollectInput {
  return {
    tenantId: "t1",
    customerId: "cust-1",
    branchId: "br-1",
    amount: 20,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    receivedAt: "2026-02-01T10:00:00.000Z",
    receivedByUserId: "collector",
    notes: "at the door",
    lines: [],
    ...over,
  };
}

const live = () => store.collections.filter((c) => c.voided_at === null);
const paidOn = async (chargeId: string) =>
  (await fakeChargeRepository.balances([chargeId]))[0]?.paid ?? 0;

async function payTwoMonths(amount: number) {
  store.seedCharge({ id: "sep", amount: 20, due_date: "2026-09-01" });
  store.seedCharge({
    id: "oct",
    amount: 20,
    due_date: "2026-10-01",
    billing_month: "2026-10-01",
  });
  const sep = openItem({ chargeId: "sep", amount: 20, dueDate: "2026-09-01" });
  const oct = openItem({ chargeId: "oct", amount: 20, dueDate: "2026-10-01" });
  const lines = [lineOf(sep, 20), lineOf(oct, amount - 20)];
  return collectionService.collect(input({ amount, lines }));
}

describe("correcting a payment's amount", () => {
  it("TC-CR-01 lowering takes the money off the NEWEST bill first", async () => {
    const original = await payTwoMonths(40);
    const { voided, replacement } = await collectionService.correct({
      collectionId: original.id,
      amount: 30,
      actorUserId: "admin",
      reason: "typo",
    });
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidReason).toBe("typo");
    expect(replacement.amount).toBe(30);
    expect(await paidOn("sep")).toBe(20);
    expect(await paidOn("oct")).toBe(10);
    expect(live().map((c) => c.id)).toEqual([replacement.id]);
  });

  it("TC-CR-02 a bill the lower amount no longer reaches leaves the payment", async () => {
    const original = await payTwoMonths(40);
    const { replacement } = await collectionService.correct({
      collectionId: original.id,
      amount: 15,
      actorUserId: "admin",
      reason: null,
    });
    expect(replacement.items?.map((i) => i.chargeId)).toEqual(["sep"]);
    expect(await paidOn("sep")).toBe(15);
    expect(await paidOn("oct")).toBe(0);
  });

  it("TC-CR-03 raising fills what the same bills still owe", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const typo = store.seedCollection("bill", 5, { id: "typo" });
    const { replacement } = await collectionService.correct({
      collectionId: typo.id,
      amount: 50,
      actorUserId: "admin",
      reason: null,
    });
    expect(replacement.amount).toBe(50);
    expect(await paidOn("bill")).toBe(50);
  });

  it("TC-CR-04 more than the bills owe is refused and nothing is written", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const paid = store.seedCollection("bill", 50, { id: "paid" });
    await expect(
      collectionService.correct({
        collectionId: paid.id,
        amount: 60,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    expect(live().map((c) => c.id)).toEqual(["paid"]);
    expect(store.collections).toHaveLength(1);
  });

  it("TC-CR-05 other payments on the bill cap how high a correction may go", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    store.seedCollection("bill", 30, { id: "other" });
    const mine = store.seedCollection("bill", 20, { id: "mine" });
    await expect(
      collectionService.correct({
        collectionId: mine.id,
        amount: 25,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    await collectionService.correct({
      collectionId: mine.id,
      amount: 10,
      actorUserId: "admin",
      reason: null,
    });
    expect(await paidOn("bill")).toBe(40);
  });

  it("TC-CR-06 zero, negative and non-numbers are refused — that is a void", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const paid = store.seedCollection("bill", 50);
    for (const amount of [0, -5, NaN, Infinity]) {
      await expect(
        collectionService.correct({
          collectionId: paid.id,
          amount,
          actorUserId: "admin",
          reason: null,
        }),
      ).rejects.toThrow(/errors\.correct_amount_positive/);
    }
  });

  it("TC-CR-07 the same amount is refused as no change", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const paid = store.seedCollection("bill", 50);
    await expect(
      collectionService.correct({
        collectionId: paid.id,
        amount: 50,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.correct_amount_unchanged/);
  });

  it("TC-CR-08 keeps the date, collector, branch, currency, rate and notes", async () => {
    store.seedCharge({ id: "bill", amount: 900000, currency_id: "cur-lbp" });
    const lbp = openItem({
      chargeId: "bill",
      amount: 900000,
      currencyId: "cur-lbp",
    });
    const original = await collectionService.collect(
      input({
        amount: 90000,
        currencyId: "cur-lbp",
        ratePerUsdSnapshot: 89500,
        lines: [lineOf(lbp, 90000)],
      }),
    );
    const { replacement } = await collectionService.correct({
      collectionId: original.id,
      amount: 900000,
      actorUserId: "admin",
      reason: null,
    });
    expect(replacement).toMatchObject({
      receivedAt: original.receivedAt,
      receivedByUserId: "collector",
      branchId: "br-1",
      customerId: "cust-1",
      currencyId: "cur-lbp",
      ratePerUsdSnapshot: 89500,
      notes: "at the door",
    });
  });

  it("TC-CR-09 cash already handed to an admin stays with that admin", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const moved = store.seedCollection("bill", 5, {
      received_by_user_id: "collector",
      held_by_user_id: "branch-admin",
    });
    const { replacement } = await collectionService.correct({
      collectionId: moved.id,
      amount: 50,
      actorUserId: "branch-admin",
      reason: null,
    });
    expect(replacement.heldByUserId).toBe("branch-admin");
    expect(replacement.receivedByUserId).toBe("collector");
  });

  it("TC-CR-10 settled (banked) cash stays settled", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const banked = store.seedCollection("bill", 5, {
      held_by_user_id: null,
      remitted_at: "2026-03-01T00:00:00.000Z",
      remitted_by: "owner",
    });
    const { replacement } = await collectionService.correct({
      collectionId: banked.id,
      amount: 50,
      actorUserId: "owner",
      reason: null,
    });
    expect(replacement).toMatchObject({
      heldByUserId: null,
      remittedAt: "2026-03-01T00:00:00.000Z",
      remittedBy: "owner",
    });
  });

  it("TC-CR-11 a bill that was written off is refused until the write-off is undone", async () => {
    store.seedCharge({
      id: "bill",
      amount: 50,
      written_off_at: "2026-03-01T00:00:00.000Z",
      written_off_by: "admin",
    });
    const paid = store.seedCollection("bill", 20);
    await expect(
      collectionService.correct({
        collectionId: paid.id,
        amount: 10,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.correct_bill_closed/);
  });

  it("TC-CR-12 an unknown or already-voided payment is refused", async () => {
    await expect(
      collectionService.correct({
        collectionId: "nope",
        amount: 10,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collection_not_found/);
    store.seedCharge({ id: "bill", amount: 50 });
    const gone = store.seedCollection("bill", 20);
    await collectionService.voidCollection(gone.id, "admin", null);
    await expect(
      collectionService.correct({
        collectionId: gone.id,
        amount: 10,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collection_already_voided/);
  });

  it("TC-CR-13 raising never spills onto a bill this payment did not pay", async () => {
    store.seedCharge({ id: "sep", amount: 20, due_date: "2026-09-01" });
    store.seedCharge({
      id: "oct",
      amount: 20,
      due_date: "2026-10-01",
      billing_month: "2026-10-01",
    });
    const sepOnly = store.seedCollection("sep", 10, { id: "sep-only" });
    await expect(
      collectionService.correct({
        collectionId: sepOnly.id,
        amount: 30,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    expect(await paidOn("oct")).toBe(0);
  });

  it("TC-CR-13b a $50 month paid in full cannot be corrected to $60", async () => {
    store.seedCharge({ id: "month", amount: 50 });
    const paid = store.seedCollection("month", 50, { id: "full" });
    await expect(
      collectionService.correct({
        collectionId: paid.id,
        amount: 60,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    expect(await paidOn("month")).toBe(50);
    expect(live().map((c) => c.id)).toEqual(["full"]);
  });

  it("TC-CR-13c a sale cannot be corrected above its total, only down to a debt", async () => {
    store.seedCharge({
      id: "sale",
      kind: "sale",
      customer_plan_id: null,
      billing_month: null,
      sale_id: "sale-1",
      amount: 30,
    });
    const till = store.seedCollection("sale", 30, { id: "till" });
    await expect(
      collectionService.correct({
        collectionId: till.id,
        amount: 40,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    expect(await paidOn("sale")).toBe(30);
    await collectionService.correct({
      collectionId: till.id,
      amount: 20,
      actorUserId: "admin",
      reason: null,
    });
    expect(await paidOn("sale")).toBe(20);
  });

  it("TC-CR-13d a shared payment's ceiling is what its OWN bills add up to", async () => {
    const original = await payTwoMonths(30);
    await expect(
      collectionService.correct({
        collectionId: original.id,
        amount: 41,
        actorUserId: "admin",
        reason: null,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_owed/);
    await collectionService.correct({
      collectionId: original.id,
      amount: 40,
      actorUserId: "admin",
      reason: null,
    });
    expect(await paidOn("sep")).toBe(20);
    expect(await paidOn("oct")).toBe(20);
  });

  it("TC-CR-14 the replacement's id comes from the original, so two devices converge", async () => {
    store.seedCharge({ id: "bill", amount: 50 });
    const typo = store.seedCollection("bill", 5, { id: "typo" });
    const { replacement } = await collectionService.correct({
      collectionId: typo.id,
      amount: 50,
      actorUserId: "admin",
      reason: null,
    });
    expect(replacement.id).toBe(await deterministicId("replaces", "typo"));
    expect(replacement.items?.[0].id).toBe(
      await deterministicId(replacement.id, "bill"),
    );
  });

  it("TC-CR-15 the header equals its items and the kind follows what is left", async () => {
    store.seedCharge({ id: "month", amount: 20, due_date: "2026-01-01" });
    store.seedCharge({
      id: "sale",
      kind: "sale",
      customer_plan_id: null,
      billing_month: null,
      amount: 20,
      due_date: "2026-02-01",
    });
    const original = await collectionService.collect(
      input({
        amount: 40,
        lines: [
          lineOf(openItem({ chargeId: "month", amount: 20 }), 20),
          lineOf(
            openItem({
              chargeId: "sale",
              kind: "sale",
              amount: 20,
              dueDate: "2026-02-01",
            }),
            20,
          ),
        ],
      }),
    );
    const { replacement } = await collectionService.correct({
      collectionId: original.id,
      amount: 20,
      actorUserId: "admin",
      reason: null,
    });
    const row = store.collections.find((c) => c.id === replacement.id)!;
    const items = store.items.filter((i) => i.collection_id === row.id);
    expect(items.reduce((s, i) => s + i.amount, 0)).toBe(row.amount);
    expect(row.kind).toBe("month");
  });
});

describe("the pure pieces", () => {
  it("TC-CR-20 withoutCollection gives back what THIS hand-over paid, and nothing else", () => {
    const bill = openItem({ chargeId: "b", amount: 50, paid: 45, balance: 5 });
    const [pooled] = withoutCollection([bill], {
      items: [collectionItem({ chargeId: "b", amount: 20 })],
    });
    expect(pooled).toMatchObject({ paid: 25, balance: 25, isDebt: true });
  });

  it("TC-CR-21 a month left with no other money reads as not-a-debt", () => {
    const bill = openItem({ chargeId: "m", amount: 20, paid: 20, balance: 0 });
    const [pooled] = withoutCollection([bill], {
      items: [collectionItem({ chargeId: "m", amount: 20 })],
    });
    expect(pooled).toMatchObject({ paid: 0, balance: 20, isDebt: false });
  });

  it("TC-CR-22 float dust never leaves a bill a millionth short", () => {
    const bill = openItem({
      chargeId: "b",
      amount: 0.3,
      paid: 0.3,
      balance: 0,
    });
    const [pooled] = withoutCollection([bill], {
      items: [collectionItem({ chargeId: "b", amount: 0.1 })],
    });
    expect(pooled.paid).toBe(0.2);
    expect(pooled.balance).toBe(0.1);
  });

  it("TC-CR-23 hasClosedBill spots a voided or written-off bill", () => {
    const open = openItem({ chargeId: "a", charge: charge({ id: "a" }) });
    const writtenOff = openItem({
      chargeId: "b",
      charge: charge({ id: "b", writtenOffAt: "2026-01-01T00:00:00.000Z" }),
    });
    const voided = openItem({
      chargeId: "c",
      charge: charge({ id: "c", voidedAt: "2026-01-01T00:00:00.000Z" }),
    });
    expect(hasClosedBill([open])).toBe(false);
    expect(hasClosedBill([open, writtenOff])).toBe(true);
    expect(hasClosedBill([voided])).toBe(true);
  });

  it("TC-CR-24 fresh cash sits with its collector; a replacement keeps its holder", () => {
    expect(receivedCustody("u1")).toEqual({
      held_by_user_id: "u1",
      remitted_at: null,
      remitted_by: null,
    });
    expect(
      custodyOf({ heldByUserId: null, remittedAt: "x", remittedBy: "o" }),
    ).toEqual({ held_by_user_id: null, remitted_at: "x", remitted_by: "o" });
  });

  it("TC-CR-25 sharedCustody is null once the cash sits in two places", () => {
    const withAdmin = { heldByUserId: "a", remittedAt: null, remittedBy: null };
    const withCollector = {
      heldByUserId: "c",
      remittedAt: null,
      remittedBy: null,
    };
    expect(sharedCustody([withAdmin, withAdmin])).toEqual(custodyOf(withAdmin));
    expect(sharedCustody([withAdmin, withCollector])).toBeNull();
    expect(sharedCustody([])).toBeNull();
  });
});
