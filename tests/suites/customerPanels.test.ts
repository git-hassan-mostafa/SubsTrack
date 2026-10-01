import { locationHref } from "@shared/core/utils/locationLink";
import { balanceUsd, owedUsd } from "@shared/modules/ledger/utils/debtRule";
import { debtItemActions, debtItemFacts } from "@shared/modules/transaction/debts/utils/debtItemView";
import { saleFacts } from "@shared/modules/transaction/sales/utils/saleView";
import { charge, openItem, sale } from "../helpers/factories";

// TC-CP-* — the customer page's debts and sales rules, decided once for both apps.
const AT = "2026-02-01T10:00:00.000Z";
const keysOf = (item: Parameters<typeof debtItemActions>[0]) => debtItemActions(item).map((a) => a.key);

describe("owedUsd", () => {
  it("TC-CP-01 sums each bill at its OWN frozen rate", () => {
    const items = [
      openItem({ balance: 10, ratePerUsdSnapshot: 1 }),
      openItem({ balance: 900000, ratePerUsdSnapshot: 90000 }),
    ];
    expect(owedUsd(items)).toBeCloseTo(20);
    expect(owedUsd(items)).toBe(balanceUsd(10, 1) + balanceUsd(900000, 90000));
  });

  it("TC-CP-02 nothing owed is zero", () => {
    expect(owedUsd([])).toBe(0);
  });
});

describe("debtItemFacts", () => {
  const today = new Date("2026-01-11T12:00:00");

  it("TC-CP-03 a clean, on-time, unpaid bill has no warning", () => {
    expect(debtItemFacts(openItem({ dueDate: "2026-01-20" }), today)).toEqual({
      writtenOff: false,
      daysLate: 0,
      partlyPaid: false,
    });
  });

  it("TC-CP-04 counts whole days past the due date and flags part paid", () => {
    const facts = debtItemFacts(openItem({ dueDate: "2026-01-01", amount: 20, paid: 5 }), today);
    expect(facts).toMatchObject({ daysLate: 10, partlyPaid: true });
  });

  it("TC-CP-05 a written-off bill reads written off", () => {
    const item = openItem({ charge: charge({ writtenOffAt: AT }) });
    expect(debtItemFacts(item, today).writtenOff).toBe(true);
  });
});

describe("debtItemActions", () => {
  it("TC-CP-06 a live month bill: collect and write off, never edit or remove", () => {
    expect(keysOf(openItem({ kind: "month", paid: 5 }))).toEqual(["collect", "write_off"]);
  });

  it("TC-CP-07 a live custom debt also offers edit and remove", () => {
    expect(keysOf(openItem({ kind: "manual" }))).toEqual(["collect", "edit", "write_off", "remove"]);
  });

  it("TC-CP-08 a written-off bill offers only the undo (plus edit/remove for custom)", () => {
    const writtenOff = charge({ writtenOffAt: AT });
    expect(keysOf(openItem({ kind: "sale", charge: writtenOff }))).toEqual(["revert_write_off"]);
    expect(keysOf(openItem({ kind: "manual", charge: writtenOff }))).toEqual([
      "revert_write_off",
      "edit",
      "remove",
    ]);
  });

  it("TC-CP-09 a row with no bill yet can only be collected", () => {
    expect(keysOf(openItem({ chargeId: null, kind: "manual" }))).toEqual(["collect"]);
  });

  it("TC-CP-10 every item carries its label key and menu band", () => {
    const [collect, writeOff] = debtItemActions(openItem());
    expect(collect).toMatchObject({ group: "money", labelKey: "payments.collect" });
    expect(writeOff).toMatchObject({ group: "danger", captionKey: "ledger.write_off_caption" });
    const remove = debtItemActions(openItem({ kind: "manual" })).find((a) => a.key === "remove");
    expect(remove).toMatchObject({ destructive: true, labelKey: "debts.remove" });
  });
});

describe("saleFacts", () => {
  const bill = charge({ id: "chg-1", kind: "sale", amount: 30 });

  it("TC-CP-11 a part-paid customer sale owes the rest and can be collected", () => {
    expect(saleFacts(sale({ amountPaid: 10, charge: bill }))).toEqual({
      voided: false,
      writtenOff: false,
      fullyPaid: false,
      owed: 20,
      canCollect: true,
    });
  });

  it("TC-CP-12 a paid sale has nothing to collect", () => {
    expect(saleFacts(sale({ amountPaid: 30, charge: bill }))).toMatchObject({ fullyPaid: true, canCollect: false });
  });

  it("TC-CP-13 a voided sale is never collected and never reads written off", () => {
    const facts = saleFacts(sale({ voidedAt: AT, charge: charge({ writtenOffAt: AT }) }));
    expect(facts).toMatchObject({ voided: true, writtenOff: false, canCollect: false });
  });

  it("TC-CP-14 a walk-in sale, or one without its bill, has no collect door", () => {
    expect(saleFacts(sale({ customerId: null, charge: bill })).canCollect).toBe(false);
    expect(saleFacts(sale({ charge: null })).canCollect).toBe(false);
  });

  it("TC-CP-15 float dust never leaves a paid sale owing", () => {
    const facts = saleFacts(sale({ totalAmount: 0.3, amountPaid: 0.1 + 0.2, charge: bill }));
    expect(facts.canCollect).toBe(false);
  });

  it("TC-CP-16 a written-off live sale still offers collect (money revives it)", () => {
    const facts = saleFacts(sale({ charge: charge({ writtenOffAt: AT }) }));
    expect(facts).toMatchObject({ writtenOff: true, canCollect: true });
  });
});

describe("locationHref", () => {
  it("TC-CP-17 keeps a full link as typed and adds https to a bare one", () => {
    expect(locationHref("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(locationHref("  maps.app.goo.gl/abc ")).toBe("https://maps.app.goo.gl/abc");
    expect(locationHref("geo:33.89,35.50")).toBe("geo:33.89,35.50");
  });

  it("TC-CP-18 an empty location has no link", () => {
    expect(locationHref("")).toBeNull();
    expect(locationHref("   ")).toBeNull();
    expect(locationHref(null)).toBeNull();
  });
});
