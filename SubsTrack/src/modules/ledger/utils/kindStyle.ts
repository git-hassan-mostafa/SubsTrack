import type { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import type { WalletSource } from "@shared/core/types";

export interface KindStyle {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgClassName: string;
}

export const KIND_STYLE: Record<WalletSource, KindStyle> = {
  month: {
    icon: "calendar-outline",
    color: COLORS.success,
    bgClassName: "bg-emerald-50",
  },
  sale: {
    icon: "receipt-outline",
    color: COLORS.success,
    bgClassName: "bg-emerald-50",
  },
  manual: {
    icon: "document-text-outline",
    color: COLORS.violet,
    bgClassName: "bg-violet-50",
  },
  mixed: {
    icon: "cash-outline",
    color: COLORS.primary,
    bgClassName: "bg-indigo-50",
  },
};
