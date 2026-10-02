import type { Currency, Product, SaleItem, Service } from "@shared/core/types";
import {
  collectedFor,
  partialOutcome,
} from "@shared/modules/ledger/utils/amountCollected";
import {
  availableFor,
  cartSignature,
  clampQuantity,
  editorInitial,
  initialRows,
  newCartRow,
  priceIn,
  resolveCart,
  sellableProducts,
  sellableServices,
  stockCredit,
  type CartRow,
} from "@shared/modules/transaction/sales/utils/saleCart";
import {
  canSaveSale,
  initialPaymentMode,
  rebuildsSaleCash,
  saleBranchId,
  saleCollected,
  saleTotalCheck,
  totalDiffersFromLines,
} from "@shared/modules/transaction/sales/utils/saleForm";
import { customer, sale } from "../helpers/factories";

// TC-SF-* — the sale form rules both apps run: the cart, the total, the cash.
const AT = "2026-02-01T00:00:00.000Z";

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    tenantId: "t1",
    branchId: null,
    name: "Router",
    description: null,
    price: 30,
    currencyId: null,
    costPrice: null,
    costCurrencyId: null,
    active: true,
    createdAt: AT,
    updatedAt: AT,
    stockOnHand: 5,
    ...over,
  };
}

function service(over: Partial<Service> = {}): Service {
  return {
    id: "sv1",
    tenantId: "t1",
    branchId: null,
    name: "Install",
    description: null,
    price: 20,
    currencyId: null,
    active: true,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function item(over: Partial<SaleItem> = {}): SaleItem {
  return {
    id: "i1",
    saleId: "s1",
    tenantId: "t1",
    lineType: "product",
    productId: "p1",
    serviceId: null,
    itemNameSnapshot: "Router",
    quantity: 2,
    unitAmount: 30,
    lineTotal: 60,
    createdAt: AT,
    ...over,
  };
}

const LBP: Currency = {
  id: "lbp",
  tenantId: "t1",
  code: "LBP",
  name: "Lebanese pound",
  symbol: null,
  ratePerUsd: 89500,
  decimals: 0,
  active: true,
  createdAt: AT,
  updatedAt: AT,
};

function row(over: Partial<CartRow> = {}): CartRow {
  return { ...newCartRow(0, "product"), ...over };
}

const NO_CREDIT = new Map<string, number>();

describe("cart lines (TC-SF-01..12)", () => {
  it("TC-SF-01 a complete product row resolves to a line and the sum", () => {
    const cart = resolveCart(
      [row({ productId: "p1", quantity: 2, unitAmount: 30 })],
      [product()],
      [],
      NO_CREDIT,
    );
    expect(cart.ready).toBe(true);
    expect(cart.total).toBe(60);
    expect(cart.lines).toHaveLength(1);
  });

  it("TC-SF-02 a row with no price or no pick is not ready and adds nothing", () => {
    const cart = resolveCart(
      [row({ productId: "p1", unitAmount: null }), row({ key: "row-1", unitAmount: 5 })],
      [product()],
      [],
      NO_CREDIT,
    );
    expect(cart.ready).toBe(false);
    expect(cart.total).toBe(0);
  });

  it("TC-SF-03 an empty cart is ready — a bare total is a sale (#142)", () => {
    expect(resolveCart([], [], [], NO_CREDIT)).toEqual({ lines: [], total: 0, ready: true });
  });

  it("TC-SF-04 a service counts once whatever its quantity field says", () => {
    const cart = resolveCart(
      [row({ lineType: "service", serviceId: "sv1", quantity: 3, unitAmount: 20 })],
      [],
      [service()],
      NO_CREDIT,
    );
    expect(cart.total).toBe(20);
    expect(cart.lines[0]).toMatchObject({ kind: "service", name: "Install" });
  });

  it("TC-SF-05 a one-off service needs its typed name", () => {
    const unnamed = row({ lineType: "service", unitAmount: 15 });
    expect(resolveCart([unnamed], [], [], NO_CREDIT).ready).toBe(false);
    const named = { ...unnamed, customName: "  Call-out  " };
    const cart = resolveCart([named], [], [], NO_CREDIT);
    expect(cart.ready).toBe(true);
    expect(cart.lines[0]).toMatchObject({ kind: "service", service: null, name: "Call-out" });
  });

  it("TC-SF-06 the same product on two rows is checked against ONE pool", () => {
    const rows = [
      row({ productId: "p1", quantity: 3, unitAmount: 30 }),
      row({ key: "row-1", productId: "p1", quantity: 3, unitAmount: 30 }),
    ];
    expect(resolveCart(rows, [product()], [], NO_CREDIT).ready).toBe(false);
    expect(availableFor(rows, "row-1", product(), NO_CREDIT)).toBe(2);
  });

  it("TC-SF-07 an edited sale's own units count as on the shelf", () => {
    const initial = editorInitial(sale({ items: [item({ quantity: 2 })] }));
    const credit = stockCredit(initial);
    const rows = [row({ productId: "p1", quantity: 2, unitAmount: 30 })];
    const empty = product({ stockOnHand: 0 });
    expect(resolveCart(rows, [empty], [], credit).ready).toBe(true);
    expect(availableFor(rows, "row-0", empty, credit)).toBe(2);
  });

  it("TC-SF-08 an inactive item stays pickable only on the sale that sold it", () => {
    const gone = product({ active: false });
    expect(sellableProducts([gone], NO_CREDIT)).toEqual([]);
    expect(sellableProducts([gone], new Map([["p1", 1]]))).toEqual([gone]);
    const oldJob = service({ active: false });
    const initial = editorInitial(
      sale({ items: [item({ lineType: "service", productId: null, serviceId: "sv1" })] }),
    );
    expect(sellableServices([oldJob], null)).toEqual([]);
    expect(sellableServices([oldJob], initial)).toEqual([oldJob]);
  });

  it("TC-SF-09 quantity stays between 1 and the stock left", () => {
    expect(clampQuantity(9, 4)).toBe(4);
    expect(clampQuantity(0, 4)).toBe(1);
    expect(clampQuantity(3, 0)).toBe(1);
  });

  it("TC-SF-10 a catalog price is converted into the sale currency and rounded", () => {
    expect(priceIn(product({ price: 30 }), LBP, [LBP])).toBe(2685000);
    expect(priceIn({ price: 100000, currencyId: "lbp" }, null, [LBP])).toBe(1.12);
  });

  it("TC-SF-11 an edit opens on the saved lines; a one-off keeps its name", () => {
    const rows = initialRows(
      editorInitial(
        sale({
          currencyId: "lbp",
          items: [
            item(),
            item({ id: "i2", lineType: "service", productId: null, itemNameSnapshot: "Call-out", quantity: 1, unitAmount: 10 }),
          ],
        }),
      ),
    );
    expect(rows.map((r) => [r.lineType, r.productId, r.customName, r.quantity])).toEqual([
      ["product", "p1", "", 2],
      ["service", null, "Call-out", 1],
    ]);
  });

  it("TC-SF-12 the signature ignores unnamed rows and never reads the catalog", () => {
    const named = [row({ productId: "p1", quantity: 1, unitAmount: 30 })];
    const withBlank = [...named, row({ key: "row-1" })];
    expect(cartSignature(withBlank, null)).toBe(cartSignature(named, null));
    expect(cartSignature(named, "lbp")).not.toBe(cartSignature(named, null));
    expect(cartSignature(named, null)).not.toBe(
      cartSignature([{ ...named[0], quantity: 2 }], null),
    );
  });
});

describe("total and money collected (TC-SF-13..21)", () => {
  it("TC-SF-13 save confirms a bare total and a total that is not the line sum", () => {
    expect(saleTotalCheck(0, 0, 50)).toBe("no_items");
    expect(saleTotalCheck(2, 60, 55)).toBe("manual");
    expect(saleTotalCheck(2, 60, 60)).toBeNull();
    expect(totalDiffersFromLines(0, 0, 50)).toBe(false);
  });

  it("TC-SF-14 full collects the total, pay later nothing, partial what was typed", () => {
    expect(collectedFor("full", 5, 60)).toBe(60);
    expect(collectedFor("debt", 5, 60)).toBe(0);
    expect(collectedFor("partial", 25, 60)).toBe(25);
    expect(collectedFor("partial", 90, 60)).toBe(60);
    expect(collectedFor("partial", null, 60)).toBe(0);
  });

  it("TC-SF-15 a walk-in sale is always collected in full", () => {
    expect(saleCollected({ hasCustomer: false, mode: "debt", typed: null, total: 40 })).toBe(40);
    expect(saleCollected({ hasCustomer: true, mode: "debt", typed: null, total: 40 })).toBe(0);
  });

  it("TC-SF-16 the partial note: too much, fully paid, or what stays owed", () => {
    expect(partialOutcome(60, 70)).toEqual({ kind: "exceeds" });
    expect(partialOutcome(60, 60)).toEqual({ kind: "cleared" });
    expect(partialOutcome(60, 20)).toEqual({ kind: "owes", balance: 40 });
    expect(partialOutcome(null, 20)).toBeNull();
    expect(partialOutcome(0.3, 0.1 + 0.2)).toEqual({ kind: "cleared" });
  });

  it("TC-SF-17 an edit opens on what the sale already collected", () => {
    expect(initialPaymentMode(sale({ totalAmount: 30, amountPaid: 0 }))).toBe("debt");
    expect(initialPaymentMode(sale({ totalAmount: 30, amountPaid: 10 }))).toBe("partial");
    expect(initialPaymentMode(sale({ totalAmount: 30, amountPaid: 30 }))).toBe("full");
  });

  it("TC-SF-18 less cash or another currency rebuilds the hand-over (#111)", () => {
    expect(rebuildsSaleCash(30, 20, null, null)).toBe(true);
    expect(rebuildsSaleCash(30, 30, null, "lbp")).toBe(true);
    expect(rebuildsSaleCash(30, 40, null, null)).toBe(false);
    expect(rebuildsSaleCash(0, 0, null, "lbp")).toBe(false);
  });

  it("TC-SF-19 save needs a ready cart and a positive total", () => {
    const base = { ready: true, total: 10, hasCustomer: true, mode: "full" as const, typed: null };
    expect(canSaveSale(base)).toBe(true);
    expect(canSaveSale({ ...base, ready: false })).toBe(false);
    expect(canSaveSale({ ...base, total: 0 })).toBe(false);
  });

  it("TC-SF-20 a partial needs a typed amount no bigger than the total", () => {
    const partial = { ready: true, total: 10, hasCustomer: true, mode: "partial" as const };
    expect(canSaveSale({ ...partial, typed: null })).toBe(false);
    expect(canSaveSale({ ...partial, typed: 11 })).toBe(false);
    expect(canSaveSale({ ...partial, typed: 10 })).toBe(true);
    expect(canSaveSale({ ...partial, hasCustomer: false, typed: null })).toBe(true);
  });

  it("TC-SF-21 the customer's branch wins, else the edit's, else the user's", () => {
    const branchCustomer = customer({ branchId: "b2" });
    expect(saleBranchId(branchCustomer, null, "b1")).toBe("b2");
    expect(saleBranchId(null, sale({ branchId: "b3" }), null)).toBe("b3");
    expect(saleBranchId(null, null, "b1")).toBe("b1");
  });
});
