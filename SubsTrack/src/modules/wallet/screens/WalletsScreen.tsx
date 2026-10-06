import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
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
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { ActionMenu } from "@/src/shared/components/ActionMenu";
import { toActionMenuItems, type Glyph } from "@/src/shared/lib/menuActions";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useAfterFirstFrame } from "@/src/shared/hooks/useAfterFirstFrame";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { useWalletActions } from "@shared/modules/wallet/hooks/useWalletActions";
import {
  cashOnHandUsd,
  walletActionMode,
  walletMenuItems,
  type WalletActionKey,
} from "@shared/modules/wallet/utils/walletView";
import type { UserWallet } from "@shared/core/types";
import { WalletCard } from "../components/WalletCard";
import { WalletDetailView } from "../components/WalletDetailView";

const WALLET_ACTION_ICONS: Record<WalletActionKey, Glyph> = {
  act_all: "checkmark-done-outline",
  blocked: "lock-closed-outline",
};

// Receiving moves cash UP the chain into your wallet — rules in utils/custody.ts.
export function WalletsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const items = useWalletStore((s) => s.items);
  const loading = useWalletStore((s) => s.loading);
  const error = useWalletStore((s) => s.error);
  const detail = useWalletStore((s) => s.detail);
  const detailLoading = useWalletStore((s) => s.detailLoading);
  const fetchWallets = useWalletStore((s) => s.fetchWallets);
  const ensureWallets = useWalletStore((s) => s.ensureWallets);
  const fetchDetail = useWalletStore((s) => s.fetchDetail);
  const clearDetail = useWalletStore((s) => s.clearDetail);
  const clearError = useWalletStore((s) => s.clearError);
  const { busyHolderId, actOnItems, actOnAll } = useWalletActions();

  const target = useDisplayCurrency();

  const branchFilter = useEffectiveBranchFilter();
  const [openWallet, setOpenWallet] = useState<UserWallet | null>(null);
  const detailReady = useAfterFirstFrame(!!openWallet);
  const [menuWallet, setMenuWallet] = useState<UserWallet | null>(null);

  useFocusEffect(
    useCallback(() => {
      void ensureWallets();
    }, [branchFilter, ensureWallets]),
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

  async function actAllFromSheet(wallet: UserWallet) {
    if (await actOnAll(wallet)) closeHolder();
  }

  const menuActions = menuWallet
    ? toActionMenuItems(walletMenuItems(menuWallet), t, {
        icons: WALLET_ACTION_ICONS,
        run: {
          act_all: () => void actOnAll(menuWallet),
          blocked: () => {},
        },
      })
    : [];

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
            {formatMoney(cashOnHandUsd(items), null, target)}
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
              menuLoading={busyHolderId === item.holderUserId}
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
        dismissOnBackdropPress={false}
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
              <Text fontWeight="Medium" className="text-base text-primary">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </SheetDragArea>
          {detailReady && openWallet ? (
            <WalletDetailView
              detail={detail}
              loading={detailLoading}
              mode={walletActionMode(openWallet)}
              busy={busyHolderId === openWallet.holderUserId}
              Scroll={BottomSheetScrollView}
              onActItems={(selected) => actOnItems(openWallet, selected)}
              onActAll={() => void actAllFromSheet(openWallet)}
            />
          ) : null}
        </ResponsiveContainer>
      </AppBottomSheet>

      <ActionMenu
        visible={menuWallet !== null}
        title={menuWallet?.holderName}
        actions={menuActions}
        onDismiss={() => setMenuWallet(null)}
      />
    </SafeAreaView>
  );
}
