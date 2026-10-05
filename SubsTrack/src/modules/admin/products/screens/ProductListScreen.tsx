import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { confirm } from "@shared/shared/lib/confirm";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@shared/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useExportRows } from "@/src/shared/hooks/useExportRows";
import { useSelection } from "@shared/shared/hooks/useSelection";
import {
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelectionBackHandler";
import type { Product } from "@shared/core/types";
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
import { ProductCard } from "../components/ProductCard";
import { ProductFormSheet } from "../components/ProductFormSheet";
import { ProductStockSheet } from "../components/ProductStockSheet";
import { ProductBatchRestockSheet } from "../components/ProductBatchRestockSheet";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";

export function ProductListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const products = useProductSlice((s) => s.items);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const fetchProducts = useProductSlice((s) => s.fetchProducts);
  const deleteProduct = useProductSlice((s) => s.deleteProduct);
  const bulkDeleteProducts = useProductSlice((s) => s.bulkDeleteProducts);
  const reactivateProduct = useProductSlice((s) => s.reactivateProduct);
  const clearError = useProductSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [batchRestockOpen, setBatchRestockOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<Product | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const history = useHistoryDoor("products");
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
    clearSelection();
    fetchProducts();
  }, [branchFilter, clearSelection, fetchProducts]);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormVisible(true);
  }

  // The form sheet stays open underneath: the stock sheet stacks on top
  // (AppBottomSheet uses stackBehavior="push") and closing it returns to the form.
  function openStock(product: Product) {
    setStockFor(product);
  }

  async function handleDelete(product: Product): Promise<boolean> {
    let deleted = false;
    await confirm({
      title: t("products.delete_title"),
      message: t("products.delete_message", { name: product.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        await deleteProduct(product.id);
        deleted = true;
      },
    });
    if (deleted) setFormVisible(false);
    return deleted;
  }

  async function handleReactivate(product: Product) {
    await reactivateProduct(product.id);
  }

  function buildActions(product: Product | null): ActionMenuItem[] {
    if (!product) return [];
    return toActionMenuItems(catalogRowActions("product", product), t, {
      icons: CATALOG_ACTION_ICONS,
      run: {
      edit: () => openEdit(product),
      stock: () => openStock(product),
      history: () => history.open(product.id, product.name),
      reactivate: () => void handleReactivate(product),
      delete: () => void handleDelete(product),
      },
    });
  }

  const filtered = debouncedSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : products;

  const {
    iconActions: exportIconActions,
    exportError,
    clearExportError,
  } = useExportRows("products.title", filtered);

  const activeCount = products.filter((p) => p.active).length;

  const selectedProducts = filtered.filter((p) => selectedIds.has(p.id));

  async function runBulkDelete(selected: Product[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      if (await handleDelete(selected[0])) clearSelection();
      return;
    }
    let deleted = false;
    await confirm({
      title: t("products.bulk_delete_title", { count: selected.length }),
      message: t("products.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        setBulkBusy(true);
        try {
          await bulkDeleteProducts(selected.map((p) => p.id));
          deleted = true;
        } finally {
          setBulkBusy(false);
        }
      },
    });
    if (deleted) clearSelection();
  }

  function buildSelectionActions(selected: Product[]): SelectionAction[] {
    const one = selected.length === 1 ? selected[0] : null;
    return toSelectionActions(catalogSelectionActions("product", selected), t, {
      icons: CATALOG_ACTION_ICONS,
      disabled: bulkBusy ? ["delete"] : [],
      run: {
        edit: () => {
          if (one) openEdit(one);
          clearSelection();
        },
        stock: () => {
          if (one) openStock(one);
          clearSelection();
        },
        reactivate: () =>
          one && void handleReactivate(one).then(clearSelection),
        delete: () => void runBulkDelete(selected),
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        iconActions={exportIconActions}
        title={t("products.title")}
        subtitle={t("products.active_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedProducts),
          onClose: clearSelection,
          allSelected:
            filtered.length > 0 && selectedProducts.length === filtered.length,
          onToggleAll: () => toggleManySelect(filtered.map((p) => p.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
        {/* Search stays mounted while selecting so its space remains and the list
          never jumps; the selection toolbar (with the select-all checkbox) is
          overlaid on the header instead. */}
        <SelectionOverlaySlot selecting={selectionActive}>
          <View className="px-4 pt-4 flex-row items-center gap-x-2">
            <View className="flex-1">
              <SearchTextBox
                searchText={searchText}
                setSearchText={setSearchText}
              />
            </View>
            {/* Restock several products in one save — the same sheet the
              quick-actions menu opens. */}
            <PressableOpacity
              onPress={() => setBatchRestockOpen(true)}
              className="flex-row items-center justify-center h-9 px-3 rounded-xl bg-emerald-50"
              accessibilityLabel={t("products.batch_restock_title")}
            >
              <Ionicons name="cube-outline" size={16} color={COLORS.success} />
              <Text
                fontWeight="SemiBold"
                className="ms-1.5 text-xs text-success"
              >
                {t("products.batch_restock_action")}
              </Text>
            </PressableOpacity>
          </View>
        </SelectionOverlaySlot>
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

        {loading && products.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
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
                  fetchProducts();
                }}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                onEdit={openEdit}
                onMenu={setMenuItem}
                selectionMode={selectionActive}
                selected={selectedIds.has(item.id)}
                onToggleSelect={(p) => toggleSelect(p.id)}
                onEnterSelection={(p) => enterSelection(p.id)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("products.no_products")}
                subMessage={t("products.no_products_hint")}
                actionLabel={
                  !debouncedSearch
                    ? t("products.create_first_product")
                    : undefined
                }
                onAction={!debouncedSearch ? openCreate : undefined}
              />
            }
          />
        )}

        {!selectionActive && (
          <FAB onPress={openCreate} accessibilityLabel={t("common.add")} />
        )}
      </ResponsiveContainer>

      {formVisible && (
        <ProductFormSheet
          product={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={(p) => void handleDelete(p)}
          onAdjustStock={openStock}
        />
      )}

      {stockFor && (
        <ProductStockSheet
          product={stockFor}
          onDismiss={() => setStockFor(null)}
        />
      )}

      {batchRestockOpen && (
        <ProductBatchRestockSheet
          onDismiss={() => setBatchRestockOpen(false)}
        />
      )}

      <ActionMenu
        visible={menuItem !== null}
        title={menuItem?.name}
        actions={buildActions(menuItem)}
        onDismiss={() => setMenuItem(null)}
      />

      {history.sheet}
    </SafeAreaView>
  );
}
