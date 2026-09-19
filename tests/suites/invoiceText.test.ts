import { buildBillInvoiceText } from "@/src/modules/invoicing/utils/invoiceText";
import type { InvoiceContext } from "@/src/modules/invoicing/utils/invoiceText";
import { charge, collection, collectionItem, LBP } from "../helpers/factories";

const t = ((key: string) => key) as InvoiceContext["t"];

const ctx: InvoiceContext = {
  t,
  orgName: "My Shop",
  currencies: [LBP],
  displayCurrencyId: null,
};

function paidBy(
  id: string,
  amount: number,
  chargeId: string,
  receivedAt: string,
) {
  return collection({
    id,
    amount,
    receivedAt,
    items: [collectionItem({ collectionId: id, chargeId, amount })],
  });
}

describe("buildBillInvoiceText", () => {
  const bill = charge({ id: "chg-1", amount: 30 });

  it("reports the bill total, what was collected and what is left", () => {
    const text = buildBillInvoiceText(ctx, "Ali", bill, [
      paidBy("col-1", 20, "chg-1", "2026-02-01T10:00:00.000Z"),
    ]);

    expect(text).toContain("ledger.bill_total: $30.00");
    expect(text).toContain("invoice.total_paid: $20.00");
    expect(text).toContain("ledger.remaining: $10.00");
  });

  it("omits the remaining row once the bill is settled", () => {
    const text = buildBillInvoiceText(ctx, "Ali", bill, [
      paidBy("col-1", 30, "chg-1", "2026-02-01T10:00:00.000Z"),
    ]);

    expect(text).not.toContain("ledger.remaining");
  });

  it("lists every hand-over oldest first", () => {
    const text = buildBillInvoiceText(ctx, "Ali", bill, [
      paidBy("col-2", 5, "chg-1", "2026-03-01T10:00:00.000Z"),
      paidBy("col-1", 15, "chg-1", "2026-02-01T10:00:00.000Z"),
    ]);

    expect(text.indexOf("$15.00")).toBeLessThan(text.indexOf("$5.00"));
  });

  it("ignores a voided hand-over", () => {
    const live = paidBy("col-1", 20, "chg-1", "2026-02-01T10:00:00.000Z");
    const dead = {
      ...paidBy("col-2", 10, "chg-1", "2026-03-01T10:00:00.000Z"),
      voidedAt: "2026-03-02T10:00:00.000Z",
    };

    const text = buildBillInvoiceText(ctx, "Ali", bill, [live, dead]);

    expect(text).toContain("invoice.total_paid: $20.00");
    expect(text).toContain("ledger.remaining: $10.00");
    expect(text).not.toContain("• 3/1/2026");
  });

  it("counts only the slice that reached THIS bill", () => {
    const split = collection({
      id: "col-1",
      amount: 50,
      items: [
        collectionItem({
          collectionId: "col-1",
          chargeId: "chg-1",
          amount: 20,
        }),
        collectionItem({
          collectionId: "col-1",
          chargeId: "chg-9",
          amount: 30,
        }),
      ],
    });

    const text = buildBillInvoiceText(ctx, "Ali", bill, [split]);

    expect(text).toContain("invoice.total_paid: $20.00");
    expect(text).toContain("ledger.remaining: $10.00");
  });

  it("keeps the bill in its own frozen currency", () => {
    const lbpBill = charge({ id: "chg-1", amount: 900000, currencyId: LBP.id });
    const text = buildBillInvoiceText(ctx, "Ali", lbpBill, [
      paidBy("col-1", 400000, "chg-1", "2026-02-01T10:00:00.000Z"),
    ]);

    expect(text).toContain("ledger.bill_total: 900,000 L.L.");
    expect(text).toContain("ledger.remaining: 500,000 L.L.");
  });
});
