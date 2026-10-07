import { useEffect } from "react";
import { useAuthSlice } from "@shared/state/hooks/useAuthSlice";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { WalletDetail } from "../components/WalletDetail";

// Only the top of the chain may close out here; everyone else waits to be received.
export function MyWalletPage() {
  const userId = useAuthSlice((s) => s.user?.id ?? null);
  const branch = useEffectiveBranchFilter();
  const detail = useWalletStore((s) => (s.detail?.holderUserId === userId ? s.detail : null));
  const loading = useWalletStore((s) => s.detailLoading);
  const error = useWalletStore((s) => s.error);
  const fetchDetail = useWalletStore((s) => s.fetchDetail);
  const clearDetail = useWalletStore((s) => s.clearDetail);
  const clearError = useWalletStore((s) => s.clearError);

  useEffect(() => {
    if (userId) void fetchDetail(userId);
  }, [userId, branch, fetchDetail]);

  useEffect(() => clearDetail, [clearDetail]);

  return (
    <WalletDetail
      detail={detail}
      loading={loading}
      error={error}
      onDismissError={clearError}
      onReload={() => {
        if (userId) void fetchDetail(userId);
      }}
    />
  );
}
