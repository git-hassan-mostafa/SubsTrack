import type { Currency, MonthBill } from "@shared/core/types";
import { activeCurrencyId, currencyChoices } from "@shared/core/utils/currency";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { planDurationLabel, pricePerPeriod } from "@shared/modules/admin/plans/utils/planLabels";
import {
  customerRecipient,
  saleRecipient,
  sendBlockedKey,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { collectBlockerKey } from "@shared/modules/ledger/utils/allocationRows";
import { amountCollectedView } from "@shared/modules/ledger/utils/amountCollected";
import { billPaymentsHeader } from "@shared/modules/ledger/utils/billView";
import { correctionProblemKey } from "@shared/modules/ledger/utils/correction";
import { voidPaymentsNotice } from "@shared/modules/ledger/utils/sharedBills";
import { withCallerItems } from "@shared/modules/ledger/utils/voidedRows";
import { mergeCollection } from "@shared/state/slices/payments/utils/mergeCollection";
import { charge, collection, collectionItem, customer, sale } from "../helpers/factories";

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key) as never;

function currency(id: string, active: boolean): Currency {
  return { id, code: id.toUpperCase(), name: id, active } as Currency;
}

describe("amount collected choice", () => {
  it("TC-SK-01 offers full, partial and pay later, in that order, with their labels", () => {
    const view = amountCollectedView("full", 50, null);
    expect(view.options.map((o) => [o.mode, o.labelKey])).toEqual([
      ["full", "payments.full_payment"],
      ["partial", "payments.partial_payment"],
      ["debt", "payments.no_payment"],
    ]);
    expect(view.options.some((o) => o.disabled)).toBe(false);
  });

  it("TC-SK-02 a zero total locks partial and reads no outcome", () => {
    const view = amountCollectedView("partial", 0, 10);
    expect(view.partialLocked).toBe(true);
    expect(view.options.find((o) => o.mode === "partial")?.disabled).toBe(true);
    expect(view.outcome).toBeNull();
  });

  it("TC-SK-03 only partial reads what a typed amount leaves owing", () => {
    expect(amountCollectedView("partial", 50, 20).outcome).toEqual({ kind: "owes", balance: 30 });
    expect(amountCollectedView("partial", 50, 60).outcome).toEqual({ kind: "exceeds" });
    expect(amountCollectedView("full", 50, 20).outcome).toBeNull();
  });
});

describe("bill payments header", () => {
  const live = collection({ id: "a" });
  const voided = collection({ id: "b", voidedAt: "2026-02-02T00:00:00.000Z" });

  it("TC-SK-04 no payments: no counts, no hint", () => {
    expect(billPaymentsHeader([], false)).toEqual({ counted: null, voided: null, hintKey: null });
  });

  it("TC-SK-05 a live bill counts live and voided payments apart", () => {
    expect(billPaymentsHeader([live, live, voided], false)).toEqual({
      counted: 2,
      voided: 1,
      hintKey: "ledger.payments_hint",
    });
    expect(billPaymentsHeader([live], false).voided).toBeNull();
  });

  it("TC-SK-06 a voided bill took every payment with it", () => {
    expect(billPaymentsHeader([live, voided], true)).toEqual({
      counted: null,
      voided: 2,
      hintKey: "ledger.bill_voided_payments_hint",
    });
  });
});

describe("refused save reasons", () => {
  it("TC-SK-07 the collect blocker and correction problem each name one text key", () => {
    expect(collectBlockerKey({ single: null, pool: { overpaying: true } })).toBe(
      "ledger.collect_blocker.lower_amount",
    );
    expect(collectBlockerKey({ single: null, pool: { overpaying: false } })).toBe(
      "ledger.collect_blocker.type_amount",
    );
    expect(correctionProblemKey("zero")).toBe("ledger.correct_zero_hint");
    expect(correctionProblemKey("unchanged")).toBe("ledger.correct_unchanged_hint");
    expect(correctionProblemKey("too_much")).toBe("ledger.collect_blocker.lower_amount");
  });
});

describe("who a receipt can go to", () => {
  it("TC-SK-08 a number needs at least one digit", () => {
    expect(canSendWhatsApp("+961 70 123 456")).toBe(true);
    expect(canSendWhatsApp("-")).toBe(false);
    expect(canSendWhatsApp("n/a")).toBe(false);
    expect(canSendWhatsApp(null)).toBe(false);
    expect(canSendWhatsApp(undefined)).toBe(false);
  });

  it("TC-SK-09 a walk-in sale has nobody; a customer may only lack a number", () => {
    const ali = customer({ name: "Ali", phoneNumber: "70123456" });
    expect(saleRecipient(sale({ customerId: null, customer: null }))).toBeNull();
    expect(saleRecipient(sale({ customer: ali }))).toEqual({ name: "Ali", phone: "70123456" });
    expect(sendBlockedKey(null)).toBe("invoice.no_customer");
    expect(sendBlockedKey(customerRecipient({ ...ali, phoneNumber: "-" }))).toBe("invoice.no_phone");
    expect(sendBlockedKey(customerRecipient(ali))).toBeNull();
  });
});

describe("plan labels", () => {
  it("TC-SK-10 one month reads Monthly; more names the span", () => {
    expect(planDurationLabel(1, t)).toBe("plans.monthly");
    expect(planDurationLabel(3, t)).toBe('plans.every_n_months {"count":3}');
  });

  it("TC-SK-11 a price names the span one payment covers", () => {
    expect(pricePerPeriod("$10", 1, t)).toBe("$10 subscriptions.per_month");
    expect(pricePerPeriod("$30", 3, t)).toBe('$30 subscriptions.per_n_months {"count":3}');
  });
});

describe("currency choices", () => {
  const all = [currency("lbp", true), currency("eur", false)];

  it("TC-SK-12 a turned-off currency stays listed only while the record holds it", () => {
    expect(currencyChoices(all, null).map((c) => c.id)).toEqual(["lbp"]);
    expect(currencyChoices(all, "eur").map((c) => c.id)).toEqual(["lbp", "eur"]);
  });

  it("TC-SK-13 the last-used currency counts only while it is still active", () => {
    expect(activeCurrencyId("lbp", all)).toBe("lbp");
    expect(activeCurrencyId("eur", all)).toBeNull();
    expect(activeCurrencyId("gone", all)).toBeNull();
    expect(activeCurrencyId(null, all)).toBeNull();
  });
});

describe("void payment warning", () => {
  const paidThree = collection({
    items: [
      collectionItem({ chargeId: "chg-1" }),
      collectionItem({ chargeId: "chg-2" }),
      collectionItem({ chargeId: "chg-3" }),
    ],
  });

  it("TC-SK-14 the count is every bill the payment paid, the bill on screen included", () => {
    const fromBill = voidPaymentsNotice([paidThree], "chg-1", t);
    expect(fromBill.message).toBe('ledger.void_covers_many_warning {"count":3}');
    expect(fromBill.bills.map((b) => b.chargeId)).toEqual(["chg-2", "chg-3"]);
    const fromList = voidPaymentsNotice([paidThree], null, t);
    expect(fromList.message).toBe('ledger.void_covers_many_warning {"count":3}');
    expect(fromList.bills).toHaveLength(3);
  });

  it("TC-SK-15 a one-bill payment gets the plain warning; many payments the bulk one", () => {
    const one = collection({ items: [collectionItem({ chargeId: "chg-1" })] });
    expect(voidPaymentsNotice([one], null, t)).toEqual({
      title: "ledger.void_payment",
      message: "ledger.void_warning",
      bills: [],
    });
    expect(voidPaymentsNotice([one, paidThree], null, t).message).toBe(
      'payments.bulk_void_message {"count":2}',
    );
  });
});

describe("bulk void patch", () => {
  it("TC-SK-16 a lean voided row takes the caller's items, so its money leaves the bill", () => {
    const monthCharge = charge({ id: "chg-1", amount: 20 });
    const bills: MonthBill[] = [{ charge: monthCharge, collected: 20 }];
    const held = collection({ id: "col-1", items: [collectionItem({ chargeId: "chg-1", amount: 20 })] });
    const lean = collection({ id: "col-1", voidedAt: "2026-02-03T00:00:00.000Z", items: undefined });

    const [voided] = withCallerItems([lean], [held]);

    expect(voided.voidedAt).toBe("2026-02-03T00:00:00.000Z");
    expect(voided.items).toEqual(held.items);
    expect(mergeCollection(bills, voided, -1)[0].collected).toBe(0);
    expect(mergeCollection(bills, lean, -1)[0].collected).toBe(20);
  });
});
