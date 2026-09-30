import { formatMoney, formatPaidFraction } from "@shared/core/utils/currency";
import { billFacts, billHeadline, billInfoRows } from "@shared/modules/ledger/utils/billView";
import { collectionInfoRows } from "@shared/modules/ledger/utils/collectionView";
import type { CollectionListItem } from "@shared/core/types";
import { charge } from "../helpers/factories";

// TC-BV-* — what one bill is and allows, decided once for both apps.
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key;
const userName = (id: string | null) => (id ? `name:${id}` : null);
const usd = (value: number) => formatMoney(value, null, null);
const AT = "2026-02-01T10:00:00.000Z";

describe("billFacts", () => {
  it("TC-BV-01 an unpaid bill is open and can be collected, written off or voided", () => {
    const facts = billFacts(charge({ amount: 20 }), 0);
    expect(facts).toMatchObject({ status: "open", balance: 20, settled: false });
    expect(facts).toMatchObject({ canCollect: true, canWriteOff: true, canVoid: true, canRevertWriteOff: false });
  });

  it("TC-BV-02 part paid is partial and still collectable", () => {
    const facts = billFacts(charge({ amount: 20 }), 5);
    expect(facts).toMatchObject({ status: "partial", balance: 15, canCollect: true });
  });

  it("TC-BV-03 a settled bill offers no collect and no write-off, only void", () => {
    const facts = billFacts(charge({ amount: 20 }), 20);
    expect(facts).toMatchObject({ status: "settled", settled: true, balance: 0 });
    expect(facts).toMatchObject({ canCollect: false, canWriteOff: false, canVoid: true });
  });

  it("TC-BV-04 a written-off bill is only undoable (or voidable), never collected", () => {
    const facts = billFacts(charge({ amount: 20, writtenOffAt: AT }), 5);
    expect(facts).toMatchObject({ status: "written_off", writtenOff: true, balance: 15 });
    expect(facts).toMatchObject({ canCollect: false, canWriteOff: false, canRevertWriteOff: true, canVoid: true });
  });

  it("TC-BV-05 a void outranks a write-off and closes every door", () => {
    const facts = billFacts(charge({ amount: 20, voidedAt: AT, writtenOffAt: AT }), 0);
    expect(facts).toMatchObject({ status: "void", voided: true, writtenOff: false, settled: false });
    expect(facts).toMatchObject({ canCollect: false, canWriteOff: false, canRevertWriteOff: false, canVoid: false });
  });

  it("TC-BV-06 float dust never leaves a paid bill a hair short", () => {
    const facts = billFacts(charge({ amount: 0.3 }), 0.1 + 0.2);
    expect(facts).toMatchObject({ status: "settled", settled: true, balance: 0, canCollect: false });
  });
});

describe("billHeadline", () => {
  it("TC-BV-07 an open bill shows paid of total and what remains", () => {
    const bill = charge({ amount: 20 });
    const head = billHeadline(bill, billFacts(bill, 5), 5, null, t);
    expect(head.amount).toBe(formatPaidFraction(5, 20, null, null));
    expect(head.note).toBe(`ledger.remaining ${usd(15)}`);
  });

  it("TC-BV-08 a settled or voided bill shows the plain total and no note", () => {
    const paid = charge({ amount: 20 });
    expect(billHeadline(paid, billFacts(paid, 20), 20, null, t)).toEqual({ amount: usd(20), note: null });
    const voided = charge({ amount: 20, voidedAt: AT });
    expect(billHeadline(voided, billFacts(voided, 0), 0, null, t)).toEqual({ amount: usd(20), note: null });
  });

  it("TC-BV-09 a written-off bill says what was kept, and nothing when nothing came", () => {
    const bill = charge({ amount: 20, writtenOffAt: AT });
    expect(billHeadline(bill, billFacts(bill, 5), 5, null, t).note).toBe(
      `ledger.written_off_kept ${JSON.stringify({ amount: usd(5) })}`,
    );
    expect(billHeadline(bill, billFacts(bill, 0), 0, null, t).note).toBeNull();
  });
});

describe("detail rows", () => {
  it("TC-BV-10 a month bill names its month; void and write-off rows stay empty until they happen", () => {
    const rows = billInfoRows(charge({ billingMonth: "2026-03-01" }), null, t, userName);
    const value = (key: string) => rows.find((r) => r.label === key)?.value ?? null;
    expect(value("ledger.billing_month")).toBe("months.mar 2026");
    expect(value("ledger.recorded_by")).toBe("name:user-1");
    expect(value("ledger.voided_at")).toBeNull();
    expect(value("ledger.written_off_by")).toBeNull();
  });

  it("TC-BV-11 a custom fee has no month row", () => {
    const rows = billInfoRows(charge({ kind: "manual" }), null, t, userName);
    expect(rows.find((r) => r.label === "ledger.billing_month")?.value).toBeNull();
  });

  it("TC-BV-12 a hand-over shows custody while live, and none once voided", () => {
    const base: CollectionListItem = {
      id: "col-1",
      customerId: "cust-1",
      customerName: "Ali",
      customerPhone: null,
      amount: 20,
      currencyId: null,
      ratePerUsdSnapshot: 1,
      receivedAt: AT,
      receivedByUserId: "collector",
      heldByUserId: "collector",
      remittedAt: null,
      remittedBy: null,
      createdAt: AT,
      branchId: null,
      notes: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      itemCount: 1,
      itemLabels: [],
      items: [],
      kind: "month",
    };
    const valueOf = (item: CollectionListItem, key: string) =>
      collectionInfoRows(item, t, userName).find((r) => r.label === key)?.value ?? null;
    expect(valueOf(base, "ledger.held_by")).toBe("name:collector");
    expect(valueOf(base, "ledger.recorded_at")).toBeNull();
    const banked = { ...base, heldByUserId: null, remittedAt: AT, remittedBy: "owner" };
    expect(valueOf(banked, "ledger.held_by")).toBe("ledger.banked");
    expect(valueOf(banked, "ledger.banked_by")).toBe("name:owner");
    const voided = { ...base, voidedAt: AT, voidedBy: "admin" };
    expect(valueOf(voided, "ledger.held_by")).toBeNull();
    expect(valueOf(voided, "ledger.voided_by")).toBe("name:admin");
  });
});
