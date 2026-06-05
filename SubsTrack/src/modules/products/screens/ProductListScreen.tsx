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
import { PageHeader } from "@/src/shared/components/PageHeader";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
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
  const reactivateProduct = useProductSlice((s) => s.reactivateProduct);
  const clearError = useProductSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [menuItem, setMenuItem] = useState<Product | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();

  useEffect(() => {
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

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.active_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        actionLabel={t("common.add")}
        onAction={openCreate}
      />

      <View className="px-4 pt-4">
        <SearchTextBox searchText={searchText} setSearchText={setSearchText} />
      </View>
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
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchProducts}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onEdit={openEdit}
              onMenu={setMenuItem}
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
