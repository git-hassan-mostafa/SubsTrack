import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { confirm } from "@/src/shared/lib/confirm";
import { useAuth } from "@/src/modules/authentication/auth";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useWalletSlice } from "@/src/state/hooks/useWalletSlice";
import type { WalletItem } from "@/src/core/types";
import { WalletDetailView } from "../components/WalletDetailView";
import { canCloseOut } from "../utils/custody";

// The signed-in user's own wallet — the cash they are carrying. Read-only for
// everyone below the top of the chain: their cash leaves only when someone above
// them receives it. A tenant-wide admin (or the owner) has nobody above them, so
// they get "Close out" here — marking the cash banked and out of the system.
// Every user role can open this from Settings.
export function MyWalletScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const detail = useWalletSlice((s) => s.detail);
  const detailLoading = useWalletSlice((s) => s.detailLoading);
  const error = useWalletSlice((s) => s.error);
  const fetchDetail = useWalletSlice((s) => s.fetchDetail);
  const clearDetail = useWalletSlice((s) => s.clearDetail);
  const closeOutItems = useWalletSlice((s) => s.closeOutItems);
  const closeOutAll = useWalletSlice((s) => s.closeOutAll);
  const clearError = useWalletSlice((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const [busy, setBusy] = useState(false);

  const mayCloseOut = user ? canCloseOut(user) : false;

  // Refresh on focus + whenever the effective branch changes. `branchFilter` is
  // an intentional dep even though the body doesn't read it — the slice action
  // resolves it internally (same pattern as WalletsScreen).
  const userId = user?.id;
  useFocusEffect(
    useCallback(() => {
      if (userId) void fetchDetail(userId);
      return () => clearDetail();
    }, [userId, branchFilter, fetchDetail, clearDetail]),
  );

  async function handleCloseOutItems(selected: WalletItem[]): Promise<boolean> {
    if (selected.length === 0) return false;
    const ok = await confirm({
      title: t("wallet.close_out_confirm_title"),
      message: t("wallet.close_out_confirm_message", { count: selected.length }),
      confirmLabel: t("wallet.close_out"),
    });
    if (!ok) return false;
    setBusy(true);
    try {
      await closeOutItems(selected.map((i) => ({ source: i.source, id: i.id })));
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseOutAll() {
    const ok = await confirm({
      title: t("wallet.close_out_all_confirm_title"),
      message: t("wallet.close_out_all_confirm_message"),
      confirmLabel: t("wallet.close_out_all"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await closeOutAll();
    } finally {
      setBusy(false);
    }
  }

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
          mode={mayCloseOut ? "close_out" : "view"}
          busy={busy}
          onActItems={handleCloseOutItems}
          onActAll={() => void handleCloseOutAll()}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
