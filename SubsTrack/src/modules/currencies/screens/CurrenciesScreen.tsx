import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectAllBar } from "@/src/shared/components/SelectAllBar";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { confirm } from "@/src/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { Currency } from "@/src/core/types";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { CurrencyCard, UsdBaseCard } from "../components/CurrencyCard";
import { CurrencyFormSheet } from "../components/CurrencyFormSheet";

export function CurrenciesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currencies = useCurrencySlice((s) => s.items);
  const loading = useCurrencySlice((s) => s.loading);
  const error = useCurrencySlice((s) => s.error);
  const fetchCurrencies = useCurrencySlice((s) => s.fetchCurrencies);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const deleteCurrency = useCurrencySlice((s) => s.deleteCurrency);
  const bulkDeleteCurrencies = useCurrencySlice((s) => s.bulkDeleteCurrencies);
  const reactivateCurrency = useCurrencySlice((s) => s.reactivateCurrency);
  const clearError = useCurrencySlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [menuCurrency, setMenuCurrency] = useState<Currency | null>(null);
  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    toggleMany: toggleManySelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    getCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(currency: Currency) {
    setEditing(currency);
    setFormVisible(true);
  }

  async function handleDeactivateCurrency(currency: Currency) {
    const ok = await confirm({
      title: t("tenant_settings.deactivate_title"),
      message: t("tenant_settings.deactivate_message", { code: currency.code }),
      destructive: true,
    });
    if (!ok) return;
    await deleteCurrency(currency.id);
  }

  async function handleDeleteCurrency(currency: Currency) {
    const ok = await confirm({
      title: t("tenant_settings.delete_title"),
      message: t("tenant_settings.delete_message", { code: currency.code }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteCurrency(currency.id);
  }

  function buildMenuActions(currency: Currency | null): ActionMenuItem[] {
    if (!currency) return [];
    const items: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(currency),
      },
    ];
    if (currency.active) {
      items.push({
        key: "deactivate",
        label: t("tenant_settings.deactivate"),
        icon: "pause-circle-outline",
        destructive: true,
        onPress: () => void handleDeactivateCurrency(currency),
      });
    } else {
      items.push({
        key: "reactivate",
        label: t("tenant_settings.reactivate"),
        icon: "play-circle-outline",
        onPress: () => reactivateCurrency(currency.id),
      });
    }
    items.push({
      key: "delete",
      label: t("common.delete"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => void handleDeleteCurrency(currency),
    });
    return items;
  }

  const activeCount = currencies.filter((c) => c.active).length;

  // Resolve selected ids against the VISIBLE list.
  const selectedCurrencies = currencies.filter((c) => selectedIds.has(c.id));

  async function runBulkDelete(selected: Currency[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDeleteCurrency(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("tenant_settings.bulk_delete_title", { count: selected.length }),
      message: t("tenant_settings.bulk_delete_message", {
        count: selected.length,
      }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteCurrencies(selected.map((c) => c.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + deactivate
  // (active) / reactivate (inactive) + delete; >1 → delete only.
  function buildSelectionActions(selected: Currency[]): SelectionAction[] {
    if (selected.length === 0) return [];
    const actions: SelectionAction[] = [];
    if (selected.length === 1) {
      const one = selected[0];
      actions.push({
        key: "edit",
        icon: "create-outline",
        label: t("common.edit"),
        onPress: () => {
          openEdit(one);
          clearSelection();
        },
      });
      if (one.active) {
        actions.push({
          key: "deactivate",
          icon: "pause-circle-outline",
          label: t("tenant_settings.deactivate"),
          destructive: true,
          onPress: () =>
            void handleDeactivateCurrency(one).then(clearSelection),
        });
      } else {
        actions.push({
          key: "reactivate",
          icon: "play-circle-outline",
          label: t("tenant_settings.reactivate"),
          onPress: () => void reactivateCurrency(one.id).then(clearSelection),
        });
      }
    }
    actions.push({
      key: "delete",
      icon: "trash-outline",
      label: t("common.delete"),
      destructive: true,
      disabled: bulkBusy,
      onPress: () => void runBulkDelete(selected),
    });
    return actions;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("tenant_settings.currencies_section_title")}
        subtitle={t("tenant_settings.currencies_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedCurrencies),
          onClose: clearSelection,
        }}
      />

      <ResponsiveContainer className="flex-1">
      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && currencies.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={currencies}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 96,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                clearSelection();
                fetchCurrencies();
              }}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            // Keep the USD base card's space while selecting so the list never
            // jumps; the select-all bar overlays it.
            <SelectionOverlaySlot
              selecting={selectionActive}
              overlay={
                <SelectAllBar
                  allSelected={
                    currencies.length > 0 &&
                    selectedCurrencies.length === currencies.length
                  }
                  onToggle={() =>
                    toggleManySelect(currencies.map((c) => c.id))
                  }
                  count={selectedCurrencies.length}
                />
              }
            >
              <UsdBaseCard />
            </SelectionOverlaySlot>
          }
          renderItem={({ item }) => (
            <CurrencyCard
              currency={item}
              onEdit={openEdit}
              onMenu={setMenuCurrency}
              selectionMode={selectionActive}
              selected={selectedIds.has(item.id)}
              onToggleSelect={(c) => toggleSelect(c.id)}
              onEnterSelection={(c) => enterSelection(c.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t("tenant_settings.no_currencies")}
              subMessage={t("tenant_settings.no_currencies_hint")}
              actionLabel={t("tenant_settings.add_currency")}
              onAction={openCreate}
            />
          }
        />
      )}

      {!selectionActive && (
        <FAB
          onPress={openCreate}
          accessibilityLabel={t("tenant_settings.add_currency")}
        />
      )}

      </ResponsiveContainer>

      {formVisible && (
        <CurrencyFormSheet
          currency={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={(currency) => void handleDeleteCurrency(currency)}
        />
      )}

      <ActionMenu
        visible={menuCurrency !== null}
        title={menuCurrency?.code}
        actions={buildMenuActions(menuCurrency)}
        onDismiss={() => setMenuCurrency(null)}
      />
    </SafeAreaView>
  );
}
