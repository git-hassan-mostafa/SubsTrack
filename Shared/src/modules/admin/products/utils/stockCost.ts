import type { Currency, Product } from "@shared/core/types";
import { convert, findCurrency } from "@shared/core/utils/currency";

// unit_cost keeps 8 decimals: shorter, and 100 over 3 units saves as 99.99.
function round8(n: number): number {
  return Number(n.toFixed(8));
}

export function totalFromUnitCost(unitCost: number | null, quantity: number): number | null {
  return unitCost != null && quantity > 0 ? round8(unitCost * quantity) : null;
}

export function unitFromTotalCost(totalCost: number | null, quantity: number): number | null {
  return totalCost != null && quantity > 0 ? round8(totalCost / quantity) : null;
}

export function parseRestockCost(text: string | undefined): number | null {
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

// The product's catalog cost in the delivery currency, as the field's first text.
export function restockCostText(
  product: Pick<Product, "costPrice" | "costCurrencyId">,
  currencies: Currency[],
  target: Currency | null,
): string {
  if (product.costPrice == null) return "";
  const value = convert(
    product.costPrice,
    findCurrency(currencies, product.costCurrencyId),
    target,
  );
  return trimZeros(value.toFixed(target?.decimals ?? 2));
}
