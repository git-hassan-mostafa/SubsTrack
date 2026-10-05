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
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { confirm } from "@shared/shared/lib/confirm";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import type { Currency } from "@shared/core/types";
import { useHistoryDoor } from "@/src/modules/admin/audit";
import {
  toActionMenuItems,
  toSelectionActions,
} from "@/src/shared/lib/menuActions";
import { CATALOG_ACTION_ICONS } from "@/src/shared/lib/catalogActionIcons";
import {
  catalogRowActions,
  catalogSelectionActions,
} from "@shared/shared/lib/catalogMenu";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
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
  const deactivateCurrency = useCurrencySlice((s) => s.deactivateCurrency);
  const bulkDeleteCurrencies = useCurrencySlice((s) => s.bulkDeleteCurrencies);
  const reactivateCurrency = useCurrencySlice((s) => s.reactivateCurrency);
  const clearError = useCurrencySlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [menuCurrency, setMenuCurrency] = useState<Currency | null>(null);
  const history = useHistoryDoor("currencies");
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
  }, [getCurrencies]);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(currency: Currency) {
    setEditing(currency);
    setFormVisible(true);
  }

  async function handleDeactivateCurrency(currency: Currency) {
    await confirm({
      title: t("tenant_settings.deactivate_title"),
      message: t("tenant_settings.deactivate_message", { code: currency.code }),
      destructive: true,
      onConfirm: async () => {
        await deactivateCurrency(currency.id);
      },
    });
  }

  async function handleDeleteCurrency(currency: Currency): Promise<boolean> {
    let deleted = false;
    await confirm({
      title: t("tenant_settings.delete_title"),
      message: t("tenant_settings.delete_message", { code: currency.code }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteCurrency(currency.id);
        deleted = true;
      },
    });
    return deleted;
  }

  function buildMenuActions(currency: Currency | null): ActionMenuItem[] {
    if (!currency) return [];
    return toActionMenuItems(catalogRowActions("currency", currency), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
      edit: () => openEdit(currency),
      history: () => history.open(currency.id, currency.code),
      deactivate: () => void handleDeactivateCurrency(currency),
      reactivate: () => void reactivateCurrency(currency.id),
      delete: () => void handleDeleteCurrency(currency),
      },
    });
  }

  const activeCount = currencies.filter((c) => c.active).length;

  const selectedCurrencies = currencies.filter((c) => selectedIds.has(c.id));

  async function runBulkDelete(selected: Currency[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      if (await handleDeleteCurrency(selected[0])) clearSelection();
      return;
    }
    let deleted = false;
    await confirm({
      title: t("tenant_settings.bulk_delete_title", { count: selected.length }),
      message: t("tenant_settings.bulk_delete_message", {
        count: selected.length,
      }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeleteCurrencies(selected.map((c) => c.id));
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  function buildSelectionActions(selected: Currency[]): SelectionAction[] {
    const one = selected.length === 1 ? selected[0] : null;
    return toSelectionActions(catalogSelectionActions("currency", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      disabled: bulkBusy ? ["delete"] : [],
      run: {
        edit: () => {
          if (one) openEdit(one);
          clearSelection();
        },
        deactivate: () =>
          one && void handleDeactivateCurrency(one).then(clearSelection),
        reactivate: () =>
          one && void reactivateCurrency(one.id).then(clearSelection),
        delete: () => void runBulkDelete(selected),
      },
    });
  }

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
  } = useExportRows("tenant_settings.currencies_section_title", currencies);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        iconActions={exportIconActions}
        title={t("tenant_settings.currencies_section_title")}
        subtitle={t("tenant_settings.currencies_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedCurrencies),
          onClose: clearSelection,
          allSelected:
            currencies.length > 0 &&
            selectedCurrencies.length === currencies.length,
          onToggleAll: () => toggleManySelect(currencies.map((c) => c.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {exportError ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={exportError} onDismiss={clearExportError} />
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
              <SelectionOverlaySlot selecting={selectionActive}>
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

      {history.sheet}
    </SafeAreaView>
  );
}
