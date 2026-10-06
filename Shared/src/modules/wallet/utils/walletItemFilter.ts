import type { WalletItem, WalletSource } from "@shared/core/types";
import { localDayKey } from "@shared/core/utils/date";

export interface WalletItemFilter {
  customerId: string | null;
  source: WalletSource | null;
  fromDay: string | null;
  toDay: string | null;
}

export interface WalletCustomerOption {
  value: string;
  label: string;
}

export const NO_WALLET_FILTER: WalletItemFilter = {
  customerId: null,
  source: null,
  fromDay: null,
  toDay: null,
};

export function hasWalletFilter(filter: WalletItemFilter): boolean {
  return (
    !!filter.customerId || !!filter.source || !!filter.fromDay || !!filter.toDay
  );
}

// Days compare as the LOCAL day each row prints, never a UTC slice.
export function filterWalletItems(
  items: WalletItem[],
  filter: WalletItemFilter,
): WalletItem[] {
  if (!hasWalletFilter(filter)) return items;
  return items.filter((item) => {
    if (filter.source && item.source !== filter.source) return false;
    if (filter.customerId && item.customerId !== filter.customerId) return false;
    const day = localDayKey(item.date);
    if (filter.fromDay && day < filter.fromDay) return false;
    if (filter.toDay && day > filter.toDay) return false;
    return true;
  });
}

export function walletCustomerOptions(items: WalletItem[]): WalletCustomerOption[] {
  const names = new Map<string, string>();
  for (const item of items) {
    if (item.customerId && item.customerName) {
      names.set(item.customerId, item.customerName);
    }
  }
  return [...names].map(([value, label]) => ({ value, label }));
}
