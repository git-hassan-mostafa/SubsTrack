import type { QuickActionKey } from "@shared/shared/lib/quickActions";
import type { Glyph } from "./menuActions";

export const QUICK_ACTION_ICONS: Record<QuickActionKey, Glyph> = {
  collect: "cash-outline",
  customer: "person-add-outline",
  sale: "receipt-outline",
  customDebt: "document-text-outline",
  expense: "trending-down-outline",
  batchRestock: "cube-outline",
  moneyReceived: "time-outline",
};

export const QUICK_ACTION_BADGES: Partial<Record<QuickActionKey, Glyph>> = {
  collect: "add",
  sale: "add",
  customDebt: "add",
  expense: "add",
  batchRestock: "add",
};
