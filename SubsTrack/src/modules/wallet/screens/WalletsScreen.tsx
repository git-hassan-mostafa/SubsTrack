import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { confirm } from "@/src/shared/lib/confirm";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { useWalletStore } from "../state/walletStore";
import type { ReceiveBlock, UserWallet, WalletItem } from "@/src/core/types";
import { WalletCard } from "../components/WalletCard";
import {
  WalletDetailView,
  type WalletActionMode,
} from "../components/WalletDetailView";

const BLOCK_LABEL: Record<Exclude<ReceiveBlock, null>, string> = {
  self: "wallet.cannot_receive_self",
  rank: "wallet.cannot_receive_rank",
  branch: "wallet.cannot_receive_branch",
};

// What the viewer may do with a given wallet. One place, so the card menu and
// the detail sheet can never offer different actions for the same wallet.
function modeFor(wallet: UserWallet): WalletActionMode {
  if (wallet.receiveBlock === null) return "receive";
  if (wallet.canCloseOut) return "close_out";
  return "view";
}

// Admin screen: everyone holding cash that has not yet left the system, with the
// total each is carrying. Tap to see the transactions behind it. Receiving moves
// the cash into YOUR wallet; you can never receive your own, and a branch admin
// only reaches their own branch's collectors (see utils/custody.ts).
export function WalletsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const items = useWalletStore((s) => s.items);
  const loading = useWalletStore((s) => s.loading);
  const error = useWalletStore((s) => s.error);
  const detail = useWalletStore((s) => s.detail);
  const detailLoading = useWalletStore((s) => s.detailLoading);
  const fetchWallets = useWalletStore((s) => s.fetchWallets);
  const fetchDetail = useWalletStore((s) => s.fetchDetail);
  const clearDetail = useWalletStore((s) => s.clearDetail);
  const receiveFrom = useWalletStore((s) => s.receiveFrom);
  const receiveAllFrom = useWalletStore((s) => s.receiveAllFrom);
  const closeOutItems = useWalletStore((s) => s.closeOutItems);
  const closeOutAll = useWalletStore((s) => s.closeOutAll);
  const clearError = useWalletStore((s) => s.clearError);

  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  const branchFilter = useEffectiveBranchFilter();
  const [openWallet, setOpenWallet] = useState<UserWallet | null>(null);
  const detailReady = useAfterFirstFrame(!!openWallet);
  const [menuWallet, setMenuWallet] = useState<UserWallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchWallets();
    }, [branchFilter, fetchWallets]),
  );

  const grandTotalUsd = useMemo(
    () => items.reduce((sum, w) => sum + w.totalUsd, 0),
    [items],
  );

  function openHolder(wallet: UserWallet) {
    setOpenWallet(wallet);
    clearDetail();
    void fetchDetail(wallet.holderUserId);
  }

  function closeHolder() {
    setOpenWallet(null);
    clearDetail();
  }

  // Act on one or several selected transactions. Returns whether it went
  // through, so the detail view can clear its selection on success.
  async function handleActItems(
    wallet: UserWallet,
    selected: WalletItem[],
  ): Promise<boolean> {
    if (selected.length === 0) return false;
    const closing = modeFor(wallet) === "close_out";
    const ok = await confirm({
      title: closing
        ? t("wallet.close_out_confirm_title")
        : t("wallet.receive_confirm_title"),
      message: closing
        ? t("wallet.close_out_confirm_message", { count: selected.length })
        : selected.length === 1
          ? t("wallet.receive_confirm_message")
          : t("wallet.receive_selected_confirm_message", {
              count: selected.length,
            }),
      confirmLabel: closing ? t("wallet.close_out") : t("wallet.receive"),
    });
    if (!ok) return false;
    const payload = selected.map((i) => i.id);
    setBusy(true);
    try {
      if (closing) await closeOutItems(payload);
      else await receiveFrom(wallet.holderUserId, payload);
      return true;
    } finally {
      setBusy(false);
    }
  }

  // Shared "empty this whole wallet" flow — used by both the detail sheet's
  // button and the list card's menu. From the sheet it also closes it (the
  // wallet drops off the list afterward).
  async function actAllFor(wallet: UserWallet, fromSheet: boolean) {
    const closing = modeFor(wallet) === "close_out";
    const ok = await confirm({
      title: closing
        ? t("wallet.close_out_all_confirm_title")
        : t("wallet.receive_all_confirm_title"),
      message: closing
        ? t("wallet.close_out_all_confirm_message")
        : t("wallet.receive_all_confirm_message", { name: wallet.holderName }),
      confirmLabel: closing ? t("wallet.close_out_all") : t("wallet.receive_all"),
    });
    if (!ok) return;
    if (fromSheet) setBusy(true);
    else setActingId(wallet.holderUserId);
    try {
      if (closing) await closeOutAll();
      else await receiveAllFrom(wallet.holderUserId);
      if (fromSheet) closeHolder();
    } finally {
      if (fromSheet) setBusy(false);
      else setActingId(null);
    }
  }

  function buildMenuActions(wallet: UserWallet | null): ActionMenuItem[] {
    if (!wallet) return [];
    const mode = modeFor(wallet);
    if (mode === "view") {
      return [
        {
          key: "blocked",
          label: t(BLOCK_LABEL[wallet.receiveBlock ?? "rank"]),
          icon: "lock-closed-outline",
          disabled: true,
          onPress: () => {},
        },
      ];
    }
    return [
      {
        key: "act-all",
        label:
          mode === "close_out"
            ? t("wallet.close_out_all")
            : t("wallet.receive_all"),
        icon: "checkmark-done-outline",
        onPress: () => void actAllFor(wallet, false),
      },
    ];
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader
        title={t("wallet.title")}
        showBack
        onBack={() => router.back()}
      />
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
      <ResponsiveContainer className="flex-1">
        <View className="px-5 py-4">
          <Text className="text-xs text-gray-400 uppercase tracking-wide">
            {t("wallet.cash_on_hand")}
          </Text>
          <Text fontWeight="Bold" className="text-2xl text-gray-900 mt-1">
            {formatMoney(grandTotalUsd, null, target)}
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(w) => w.holderUserId}
          renderItem={({ item }) => (
            <WalletCard
              wallet={item}
              onPress={() => openHolder(item)}
              onMenu={() => setMenuWallet(item)}
              menuLoading={actingId === item.holderUserId}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void fetchWallets()}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                message={t("wallet.list_empty_title")}
                subMessage={t("wallet.list_empty_desc")}
              />
            )
          }
        />
      </ResponsiveContainer>

      <AppBottomSheet
        visible={!!openWallet}
        onDismiss={closeHolder}
        variant="full"
      >
        <ResponsiveContainer className="flex-1">
          <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900 flex-1 pe-2"
              numberOfLines={1}
            >
              {openWallet?.holderName ?? ""}
            </Text>
            <PressableOpacity onPress={closeHolder}>
              <Text className="text-base text-primary font-medium">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </SheetDragArea>
          {detailReady && openWallet ? (
            <WalletDetailView
              detail={detail}
              loading={detailLoading}
              mode={modeFor(openWallet)}
              busy={busy}
              onActItems={(selected) => handleActItems(openWallet, selected)}
              onActAll={() => void actAllFor(openWallet, true)}
            />
          ) : null}
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuWallet !== null}
        title={menuWallet?.holderName}
        actions={buildMenuActions(menuWallet)}
        onDismiss={() => setMenuWallet(null)}
      />
    </SafeAreaView>
  );
}
