import { useMemo, useState } from "react";
import type { WalletItem } from "@shared/core/types";
import {
  filterWalletItems,
  hasWalletFilter,
  NO_WALLET_FILTER,
  walletCustomerOptions,
  type WalletItemFilter,
} from "@shared/modules/wallet/utils/walletItemFilter";

// Filters belong to one wallet: opening another holder starts them empty.
export function useWalletItemFilters(items: WalletItem[], holderId: string | null) {
  const [held, setHeld] = useState({ holderId, filter: NO_WALLET_FILTER });
  const filter = held.holderId === holderId ? held.filter : NO_WALLET_FILTER;

  const rows = useMemo(() => filterWalletItems(items, filter), [items, filter]);
  const customers = useMemo(() => walletCustomerOptions(items), [items]);

  return {
    filter,
    rows,
    customers,
    active: hasWalletFilter(filter),
    set: (patch: Partial<WalletItemFilter>) =>
      setHeld({ holderId, filter: { ...filter, ...patch } }),
    clear: () => setHeld({ holderId, filter: NO_WALLET_FILTER }),
  };
}
