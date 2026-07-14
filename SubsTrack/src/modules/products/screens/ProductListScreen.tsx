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
import { confirm } from "@/src/shared/lib/confirm";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectAllBar } from "@/src/shared/components/SelectAllBar";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { Product } from "@/src/core/types";
import { ProductCard } from "../components/ProductCard";
import { ProductFormSheet } from "../components/ProductFormSheet";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";

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
  const [menuItem, setMenuItem] = useState<Product | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormVisible(true);
  }

  async function handleDelete(product: Product) {
    const ok = await confirm({
      title: t("products.delete_title"),
      message: t("products.delete_message", { name: product.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteProduct(product.id);
    setFormVisible(false);
  }

  async function handleReactivate(product: Product) {
    await reactivateProduct(product.id);
  }

  function buildActions(product: Product | null): ActionMenuItem[] {
    if (!product) return [];
    const actions: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(product),
      },
    ];
    if (product.active) {
      actions.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDelete(product),
      });
    } else {
      actions.push({
        key: "reactivate",
        label: t("common.reactivate"),
        icon: "refresh-outline",
        onPress: () => void handleReactivate(product),
      });
    }
    return actions;
  }

  const filtered = debouncedSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : products;

  const activeCount = products.filter((p) => p.active).length;

  // Resolve selected ids against the VISIBLE list, so a selected-then-filtered-out
  // product can never be acted on invisibly.
  const selectedProducts = filtered.filter((p) => selectedIds.has(p.id));

  async function runBulkDelete(selected: Product[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDelete(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("products.bulk_delete_title", { count: selected.length }),
      message: t("products.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteProducts(selected.map((p) => p.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + delete (active)
  // / reactivate (inactive); >1 → delete only.
  function buildSelectionActions(selected: Product[]): SelectionAction[] {
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
      if (!one.active) {
        actions.push({
          key: "reactivate",
          icon: "refresh-outline",
          label: t("common.reactivate"),
          onPress: () => void handleReactivate(one).then(clearSelection),
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
        title={t("products.title")}
        subtitle={t("products.active_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedProducts),
          onClose: clearSelection,
        }}
      />

      <ResponsiveContainer className="flex-1">
      {/* Search stays mounted while selecting so its space remains and the list
          never jumps; the select-all bar overlays it. */}
      <SelectionOverlaySlot
        selecting={selectionActive}
        overlay={
          <SelectAllBar
            allSelected={
              filtered.length > 0 && selectedProducts.length === filtered.length
            }
            onToggle={() => toggleManySelect(filtered.map((p) => p.id))}
            count={selectedProducts.length}
          />
        }
      >
        <View className="px-4 pt-4">
          <SearchTextBox
            searchText={searchText}
            setSearchText={setSearchText}
          />
        </View>
      </SelectionOverlaySlot>
      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
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
        />
      )}

      <ActionMenu
        visible={menuItem !== null}
        title={menuItem?.name}
        actions={buildActions(menuItem)}
        onDismiss={() => setMenuItem(null)}
      />
    </SafeAreaView>
  );
}
