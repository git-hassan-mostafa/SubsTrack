import type { Ionicons } from "@expo/vector-icons";
import type { ChargeKind } from "@/src/core/types";

/** The bill's kind IS its icon, so a chip never has to repeat it. */
export const KIND_ICON: Record<ChargeKind, keyof typeof Ionicons.glyphMap> = {
  month: "calendar-outline",
  sale: "receipt-outline",
  manual: "document-text-outline",
};
