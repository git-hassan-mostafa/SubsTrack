import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
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
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { useWalletSlice } from "@/src/state/hooks/useWalletSlice";
import type { CollectorWallet, WalletItem } from "@/src/core/types";
import { CollectorWalletCard } from "../components/CollectorWalletCard";
import { WalletDetailView } from "../components/WalletDetailView";

// Admin screen: every collector who is holding cash not yet handed over, with
// the total each owes the business. Tap a collector to see the transactions and
// mark them received (per transaction, or all at once).
export function WalletsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const items = useWalletSlice((s) => s.items);
  const loading = useWalletSlice((s) => s.loading);
  const error = useWalletSlice((s) => s.error);
  const detail = useWalletSlice((s) => s.detail);
  const detailLoading = useWalletSlice((s) => s.detailLoading);
  const fetchWallets = useWalletSlice((s) => s.fetchWallets);
  const fetchDetail = useWalletSlice((s) => s.fetchDetail);
  const clearDetail = useWalletSlice((s) => s.clearDetail);
  const receiveItems = useWalletSlice((s) => s.receiveItems);
  const receiveAllFromCollector = useWalletSlice(
    (s) => s.receiveAllFromCollector,
  );
  const clearError = useWalletSlice((s) => s.clearError);

  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);

  const branchFilter = useEffectiveBranchFilter();
  const [openWallet, setOpenWallet] = useState<CollectorWallet | null>(null);
  const [menuWallet, setMenuWallet] = useState<CollectorWallet | null>(null);
  const [busy, setBusy] = useState(false);
  // Collector whose "receive all" is currently running from the list card (its
  // card shows a spinner). Separate from `busy`, which drives the detail sheet.
  const [receivingId, setReceivingId] = useState<string | null>(null);

  // Refresh on focus + whenever the effective branch changes.
  useFocusEffect(
    useCallback(() => {
      void fetchWallets();
    }, [branchFilter, fetchWallets]),
  );

  const grandTotalUsd = useMemo(
    () => items.reduce((sum, w) => sum + w.totalUsd, 0),
    [items],
  );

  function openCollector(wallet: CollectorWallet) {
    setOpenWallet(wallet);
    clearDetail();
    void fetchDetail(wallet.collectorUserId);
  }

  function closeCollector() {
    setOpenWallet(null);
    clearDetail();
  }

  // Receive one or several selected transactions. Returns whether it went
  // through, so the detail view can clear its selection on success.
  async function handleReceiveItems(items: WalletItem[]): Promise<boolean> {
    if (items.length === 0) return false;
    const ok = await confirm({
      title: t("wallet.receive_confirm_title"),
      message:
        items.length === 1
          ? t("wallet.receive_confirm_message")
          : t("wallet.receive_selected_confirm_message", {
              count: items.length,
            }),
      confirmLabel: t("wallet.receive"),
    });
    if (!ok) return false;
    setBusy(true);
    try {
      await receiveItems(items.map((i) => ({ source: i.source, id: i.id })));
      return true;
    } finally {
      setBusy(false);
    }
  }

  // Shared "receive everything from this collector" flow — used by both the
  // detail sheet's button and the list card's menu. When invoked from the sheet
  // it also closes it (the collector drops off the list afterward).
  async function receiveAllFor(wallet: CollectorWallet, fromSheet: boolean) {
    const ok = await confirm({
      title: t("wallet.receive_all_confirm_title"),
      message: t("wallet.receive_all_confirm_message", {
        name: wallet.collectorName,
      }),
      confirmLabel: t("wallet.receive_all"),
    });
    if (!ok) return;
    if (fromSheet) setBusy(true);
    else setReceivingId(wallet.collectorUserId);
    try {
      await receiveAllFromCollector(wallet.collectorUserId);
      if (fromSheet) closeCollector();
    } finally {
      if (fromSheet) setBusy(false);
      else setReceivingId(null);
    }
  }

  function handleReceiveAll() {
    if (!openWallet) return;
    void receiveAllFor(openWallet, true);
  }

  function buildMenuActions(wallet: CollectorWallet | null): ActionMenuItem[] {
    if (!wallet) return [];
    return [
      {
        key: "receive-all",
        label: t("wallet.receive_all"),
        icon: "checkmark-done-outline",
        onPress: () => void receiveAllFor(wallet, false),
      },
    ];
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <ResponsiveContainer className="flex-1">
        <PageHeader
          title={t("wallet.title")}
          showBack
          onBack={() => router.back()}
        />
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        <View className="px-5 py-4">
          <Text className="text-xs text-gray-400 uppercase tracking-wide">
            {t("wallet.unremitted_total")}
          </Text>
          <Text fontWeight="Bold" className="text-2xl text-gray-900 mt-1">
            {formatMoney(grandTotalUsd, null, target)}
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(w) => w.collectorUserId}
          renderItem={({ item }) => (
            <CollectorWalletCard
              wallet={item}
              onPress={() => openCollector(item)}
              onMenu={() => setMenuWallet(item)}
              menuLoading={receivingId === item.collectorUserId}
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
        onDismiss={closeCollector}
        variant="full"
      >
        <ResponsiveContainer className="flex-1">
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900 flex-1 pe-2"
              numberOfLines={1}
            >
              {openWallet?.collectorName ?? ""}
            </Text>
            <PressableOpacity onPress={closeCollector}>
              <Text className="text-base text-primary font-medium">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </View>
          <WalletDetailView
            detail={detail}
            loading={detailLoading}
            busy={busy}
            onReceiveItems={handleReceiveItems}
            onReceiveAll={handleReceiveAll}
          />
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuWallet !== null}
        title={menuWallet?.collectorName}
        actions={buildMenuActions(menuWallet)}
        onDismiss={() => setMenuWallet(null)}
      />
    </SafeAreaView>
  );
}
