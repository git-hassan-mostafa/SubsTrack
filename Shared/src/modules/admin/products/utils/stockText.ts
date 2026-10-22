import type { TFunction } from "i18next";
import type { Currency, StockMovement } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";

export function signedQuantity(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function stockLevelLabel(t: TFunction, onHand: number): string {
  if (onHand > 0) return t("products.in_stock", { quantity: onHand });
  if (onHand < 0) return t("products.oversold", { quantity: -onHand });
  return t("products.out_of_stock");
}

// An untracked product's pool is endless: the price alone, never a count.
export function saleProductSublabel(
  t: TFunction,
  price: string,
  pool: number,
): string {
  if (pool === Number.POSITIVE_INFINITY) return price;
  if (pool > 0) return `${price} · ${t("sales.stock_left", { quantity: pool })}`;
  return t("products.out_of_stock");
}

export function stockEntryLabel(
  t: TFunction,
  movement: Pick<StockMovement, "reason" | "quantityDelta">,
): string {
  return `${t(`products.stock_reason_${movement.reason}`)} ${signedQuantity(movement.quantityDelta)}`;
}

export interface StockEntryCost {
  amount: string;
  refund: boolean;
}

// A removal with a cost gives money back; a reversed entry costs nothing.
export function stockEntryCost(
  movement: Pick<StockMovement, "unitCost" | "quantityDelta" | "currencyId" | "voidedAt">,
  currencies: Currency[],
): StockEntryCost | null {
  if (movement.unitCost == null || movement.voidedAt !== null) return null;
  const currency = findCurrency(currencies, movement.currencyId);
  return {
    amount: formatMoney(Math.abs(movement.quantityDelta * movement.unitCost), currency, currency),
    refund: movement.quantityDelta < 0,
  };
}

export type StockEntryActionKey = "edit" | "history" | "revert";

export type StockEntryMenuItem = MenuItem<StockEntryActionKey>;

const STOCK_ENTRY_MENU: MenuTable<StockEntryActionKey> = {
  edit: { group: "manage", labelKey: "products.edit_stock_entry" },
  history: { group: "history", labelKey: "audit.history" },
  revert: { group: "danger", labelKey: "products.revert_stock_entry", destructive: true },
};

// A sale owns its movement (fixed on the sale); a reverted one keeps its history.
export function stockEntryActions(
  movement: Pick<StockMovement, "voidedAt" | "reason">,
): StockEntryMenuItem[] {
  const fromSale = movement.reason === "sale";
  const locked =
    (fromSale && "why_disabled.sale_stock_entry") ||
    (!!movement.voidedAt && "why_disabled.stock_reverted");
  const keys: StockEntryActionKey[] = fromSale ? ["edit", "revert"] : ["edit", "history", "revert"];
  return pickMenu(STOCK_ENTRY_MENU, keys, { edit: locked, revert: locked });
}
