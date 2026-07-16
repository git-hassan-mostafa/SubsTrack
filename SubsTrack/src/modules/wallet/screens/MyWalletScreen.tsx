import { useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@/src/modules/authentication/auth";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useWalletSlice } from "@/src/state/hooks/useWalletSlice";
import { WalletDetailView } from "../components/WalletDetailView";

// The signed-in user's own wallet — cash they have collected but not yet handed
// over. Read-only: only an admin can mark cash received (from the admin Wallets
// screen). Every user role can open this from Settings.
export function MyWalletScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const detail = useWalletSlice((s) => s.detail);
  const detailLoading = useWalletSlice((s) => s.detailLoading);
  const error = useWalletSlice((s) => s.error);
  const fetchDetail = useWalletSlice((s) => s.fetchDetail);
  const clearDetail = useWalletSlice((s) => s.clearDetail);
  const clearError = useWalletSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();

  useFocusEffect(
    useCallback(() => {
      if (user) void fetchDetail(user.id);
      return () => clearDetail();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, branchFilter]),
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
        <WalletDetailView detail={detail} loading={detailLoading} readOnly />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
