import type { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/shared/constants';
import type { WalletSource } from '@/src/core/types';

export interface KindStyle {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgClassName: string;
  /** The kind CHIP — month and sale share a tint, so the WORD parts them. */
  chipClassName: string;
}

// Sale is emerald app-wide (SaleCard), so the GLYPH parts it from a month.
export const KIND_STYLE: Record<WalletSource, KindStyle> = {
  month: {
    icon: 'calendar-outline',
    color: COLORS.success,
    bgClassName: 'bg-emerald-50',
    chipClassName: 'bg-emerald-50 text-emerald-700',
  },
  sale: {
    icon: 'receipt-outline',
    color: COLORS.success,
    bgClassName: 'bg-emerald-50',
    chipClassName: 'bg-emerald-50 text-emerald-700',
  },
  manual: {
    icon: 'document-text-outline',
    color: COLORS.violet,
    bgClassName: 'bg-violet-50',
    chipClassName: 'bg-violet-50 text-violet-700',
  },
  mixed: {
    icon: 'cash-outline',
    color: COLORS.primary,
    bgClassName: 'bg-indigo-50',
    chipClassName: 'bg-indigo-50 text-indigo-700',
  },
};
