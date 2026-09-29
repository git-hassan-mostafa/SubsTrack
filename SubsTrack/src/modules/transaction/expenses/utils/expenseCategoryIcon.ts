import type { Ionicons } from "@expo/vector-icons";
import type { ExpenseCategory } from "@shared/core/types";

type IconName = keyof typeof Ionicons.glyphMap;

const ICON_BY_CATEGORY: Record<ExpenseCategory, IconName> = {
  rent: "business-outline",
  salaries: "people-outline",
  utilities: "flash-outline",
  fuel: "flame-outline",
  transport: "car-outline",
  maintenance: "construct-outline",
  equipment: "hardware-chip-outline",
  internet: "globe-outline",
  taxes: "document-text-outline",
  marketing: "megaphone-outline",
  other: "ellipsis-horizontal-outline",
  stock: "cube-outline",
};

export function expenseCategoryIcon(code: ExpenseCategory): IconName {
  return ICON_BY_CATEGORY[code] ?? "ellipsis-horizontal-outline";
}
