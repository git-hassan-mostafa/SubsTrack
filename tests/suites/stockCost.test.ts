import type { TFunction } from "i18next";
import {
  parseRestockCost,
  restockCostText,
  totalFromUnitCost,
  unitFromTotalCost,
} from "@shared/modules/admin/products/utils/stockCost";
import {
  signedQuantity,
  stockEntryLabel,
  stockLevelLabel,
} from "@shared/modules/admin/products/utils/stockText";
import { LBP } from "../helpers/factories";

// TC-SC-* — the stock cost fields, which decide what a restock adds to Expenses.

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key) as unknown as TFunction;

describe("stock cost fields", () => {
  it("TC-SC-01 a unit cost times the quantity is the total, kept at 8 decimals", () => {
    expect(totalFromUnitCost(2.5, 4)).toBe(10);
    expect(totalFromUnitCost(0.123456789, 3)).toBe(0.37037037);
  });

  it("TC-SC-02 a typed total splits back to 8 decimals, so the saved expense adds up", () => {
    const unit = unitFromTotalCost(100, 3);
    expect(unit).toBe(33.33333333);
    expect(Math.abs((unit ?? 0) * 3 - 100)).toBeLessThan(0.0001);
  });

  it("TC-SC-03 no cost or no quantity gives no figure, never a zero expense", () => {
    expect(totalFromUnitCost(null, 3)).toBeNull();
    expect(totalFromUnitCost(5, 0)).toBeNull();
    expect(unitFromTotalCost(null, 3)).toBeNull();
    expect(unitFromTotalCost(100, 0)).toBeNull();
  });

  it("TC-SC-04 a batch cost is only a real positive number", () => {
    expect(parseRestockCost("12.5")).toBe(12.5);
    expect(parseRestockCost("")).toBeNull();
    expect(parseRestockCost(undefined)).toBeNull();
    expect(parseRestockCost("0")).toBeNull();
    expect(parseRestockCost(".")).toBeNull();
  });

  it("TC-SC-05 a batch row starts at the catalog cost in the delivery currency", () => {
    const usdCost = { costPrice: 12.5, costCurrencyId: null };
    expect(restockCostText(usdCost, [LBP], null)).toBe("12.5");
    expect(restockCostText({ costPrice: 5, costCurrencyId: null }, [LBP], null)).toBe("5");
    expect(restockCostText({ costPrice: 1, costCurrencyId: null }, [LBP], LBP)).toBe("90000");
    expect(restockCostText({ costPrice: 30000, costCurrencyId: LBP.id }, [LBP], null)).toBe(
      "0.33",
    );
  });

  it("TC-SC-06 a product with no catalog cost starts empty", () => {
    expect(restockCostText({ costPrice: null, costCurrencyId: null }, [LBP], LBP)).toBe("");
  });
});

describe("stock text", () => {
  it("TC-SC-07 a stock change always shows its sign", () => {
    expect(signedQuantity(3)).toBe("+3");
    expect(signedQuantity(-2)).toBe("-2");
    expect(stockEntryLabel(t, { reason: "restock", quantityDelta: 4 })).toBe(
      "products.stock_reason_restock +4",
    );
  });

  it("TC-SC-08 the stock pill says in stock, out of stock, or short by", () => {
    expect(stockLevelLabel(t, 5)).toBe('products.in_stock{"quantity":5}');
    expect(stockLevelLabel(t, 0)).toBe("products.out_of_stock");
    expect(stockLevelLabel(t, -2)).toBe('products.oversold{"quantity":2}');
  });
});
