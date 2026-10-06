import { useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { useWalletActions } from "@shared/modules/wallet/hooks/useWalletActions";
import { walletActionMode } from "@shared/modules/wallet/utils/walletView";
import { WalletDetailView } from "../components/WalletDetailView";

// Only the top of the chain may close out here; everyone else waits to be received.
export function MyWalletScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const detail = useWalletStore((s) => s.detail);
  const detailLoading = useWalletStore((s) => s.detailLoading);
  const error = useWalletStore((s) => s.error);
  const fetchDetail = useWalletStore((s) => s.fetchDetail);
  const clearDetail = useWalletStore((s) => s.clearDetail);
  const clearError = useWalletStore((s) => s.clearError);
  const { busyHolderId, actOnItems, actOnAll } = useWalletActions();

  const branchFilter = useEffectiveBranchFilter();

  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (userId) void fetchDetail(userId);
      return () => clearDetail();
    }, [userId, branchFilter, fetchDetail, clearDetail]),
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ResponsiveContainer className="flex-1">
        <PageHeader
          title={t("wallet.my_title")}
          showBack
          onBack={() => router.back()}
          hideBranchSelector
        />
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
        <WalletDetailView
          detail={detail}
          loading={detailLoading}
          mode={walletActionMode(detail)}
          busy={busyHolderId !== null}
          onActItems={(selected) =>
            detail ? actOnItems(detail, selected) : Promise.resolve(false)
          }
          onActAll={() => {
            if (detail) void actOnAll(detail);
          }}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
