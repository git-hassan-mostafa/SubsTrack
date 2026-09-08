import type { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/shared/constants';
import type { ChipTone } from '@/src/shared/components/Chip';
import type { WalletSource } from '@/src/core/types';

export interface KindStyle {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgClassName: string;
  chipTone: ChipTone;
}

export const KIND_STYLE: Record<WalletSource, KindStyle> = {
  month: {
    icon: 'calendar-outline',
    color: COLORS.success,
    bgClassName: 'bg-emerald-50',
    chipTone: 'emerald',
  },
  sale: {
    icon: 'receipt-outline',
    color: COLORS.success,
    bgClassName: 'bg-emerald-50',
    chipTone: 'emerald',
  },
  manual: {
    icon: 'document-text-outline',
    color: COLORS.violet,
    bgClassName: 'bg-violet-50',
    chipTone: 'violet',
  },
  mixed: {
    icon: 'cash-outline',
    color: COLORS.primary,
    bgClassName: 'bg-indigo-50',
    chipTone: 'indigo',
  },
};
