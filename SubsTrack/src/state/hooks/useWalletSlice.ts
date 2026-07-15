import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { WalletSlice } from '@/src/state/slices/wallet/walletSlice';

export function useWalletSlice(): WalletSlice;
export function useWalletSlice<T>(selector: (state: WalletSlice) => T): T;
export function useWalletSlice<T = WalletSlice>(selector?: (state: WalletSlice) => T): T {
  return useGlobalStore((state) => {
    const slice = state.wallet;
    return selector ? selector(slice) : (slice as T);
  });
}
