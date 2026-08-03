import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { useSheetTextInput } from "@/src/shared/components/bottomSheetInputContext";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { COLORS } from "@/src/shared/constants";
import type { Product } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";

interface Props {
  onDismiss: () => void;
}

/**
 * Adds stock to several products in one go — a whole delivery, one save. Each
 * product with a quantity becomes its own 'restock' ledger row (written in a
 * single call), so the per-product history stays exactly as detailed as when the
 * stock sheet is used one product at a time.
 *
 * Built on {@link AppBottomSheet} rather than `FormSheet` because the body IS the
 * product list: a virtualized `BottomSheetFlatList` keeps a large catalog cheap,
 * with the search / note / save chrome as its header and footer. Those are passed
 * as ELEMENTS, never as inline function components — a new function identity each
 * render would remount the footer and steal focus from the note field.
 */
export function ProductBatchRestockSheet({ onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const products = useProductSlice((s) => s.items);
  const getProducts = useProductSlice((s) => s.getProducts);
  const batchRestock = useProductSlice((s) => s.batchRestock);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);

  // productId → units arriving. Absent / 0 means "not part of this restock".
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    clearError();
    // Self-guards on the slice's `loaded` flag — no refetch when already in memory.
    void getProducts();
    return clearError;
  }, [clearError, getProducts]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active),
    [products],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((p) => p.name.toLowerCase().includes(term));
  }, [activeProducts, search]);

  const entries = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [quantities],
  );
  const totalUnits = entries.reduce((sum, e) => sum + e.quantity, 0);
  const hasProducts = activeProducts.length > 0;

  // Quantity TOTALS, not the `quantities` map: "Clear" writes a fresh empty
  // object, so an identity diff would keep the form dirty after clearing it.
  // `search` is excluded — it only filters, nothing is lost by closing.
  const dirty = useDirtyForm({ lineCount: entries.length, totalUnits, note });

  function setQuantity(productId: string, quantity: number) {
    clearError();
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, quantity) }));
  }

  async function handleSubmit() {
    if (!user || entries.length === 0) return;
    const ok = await batchRestock(entries, user.tenantId, note, user.id);
    if (!ok) return;
    onDismiss();
  }

  const header = (
    <View className="pb-1">
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Text className="text-sm text-gray-500 mb-4">
        {t("products.batch_restock_subtitle")}
      </Text>

      {hasProducts ? (
        <>
          <SearchTextBox
            searchText={search}
            setSearchText={setSearch}
            placeholder={t("products.batch_restock_search")}
          />
          <View className="flex-row items-center justify-between mt-4 mb-2">
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {t("products.batch_restock_products", { count: visible.length })}
            </Text>
            {entries.length > 0 ? (
              <PressableOpacity onPress={() => setQuantities({})} hitSlop={8}>
                <Text className="text-xs text-primary font-medium">
                  {t("common.clear")}
                </Text>
              </PressableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );

  const footer = hasProducts ? (
    <View className="pt-4">
      <Input
        label={t("products.batch_restock_note_label")}
        value={note}
        onChangeText={setNote}
        placeholder={t("products.stock_note_placeholder")}
        onFocus={clearError}
      />

      {/* Summary — a one-glance answer to "what am I about to save?" */}
      <View className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          {t("products.batch_restock_selected", { count: entries.length })}
        </Text>
        <Text
          fontWeight="Bold"
          className={`text-base ${totalUnits > 0 ? "text-success" : "text-gray-300"}`}
        >
          +{totalUnits}
        </Text>
      </View>

      <Button
        label={t("products.batch_restock_save")}
        onPress={handleSubmit}
        loading={loading}
        disabled={entries.length === 0 || loading}
        fullWidth
      />
    </View>
  ) : null;

  const empty = (
    <View className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 items-center">
      <Ionicons name="cube-outline" size={22} color={COLORS.gray300} />
      <Text className="text-sm text-gray-400 mt-2 text-center">
        {t(
          hasProducts
            ? "products.batch_restock_no_match"
            : "products.batch_restock_no_products",
        )}
      </Text>
    </View>
  );

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full" dirty={dirty}>
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text
            fontWeight="Bold"
            className="text-lg text-gray-900"
            numberOfLines={1}
          >
            {t("products.batch_restock_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        <BottomSheetFlatList
          data={visible}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 48 + insets.bottom,
          }}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <RestockRow
              product={item}
              quantity={quantities[item.id] ?? 0}
              onChange={(q) => setQuantity(item.id, q)}
            />
          )}
        />
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}

interface RowProps {
  product: Product;
  quantity: number;
  onChange: (quantity: number) => void;
}

// One product line: name + current stock on the left, a stepper on the right.
// A row with a quantity turns indigo and previews the resulting stock, so the
// picked products stand out without reordering the list while the user types.
function RestockRow({ product, quantity, onChange }: RowProps) {
  const TextInput = useSheetTextInput();
  const picked = quantity > 0;

  return (
    <View
      className={`flex-row items-center rounded-2xl border px-3 py-2 mb-2 ${
        picked ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"
      }`}
    >
      <View className="flex-1 pe-2">
        <Text
          fontWeight="SemiBold"
          numberOfLines={1}
          className="text-sm text-gray-900"
        >
          {product.name}
        </Text>
        <View className="flex-row items-center mt-0.5">
          <Text className="text-xs text-gray-400">{product.stockOnHand}</Text>
          {picked ? (
            <>
              <View className="mx-1">
                <DirectionalIcon
                  name="arrow-forward"
                  size={11}
                  color={COLORS.success}
                />
              </View>
              <Text fontWeight="SemiBold" className="text-xs text-success">
                {product.stockOnHand + quantity}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center rounded-xl border border-gray-200 bg-white px-1 py-1">
        <PressableOpacity
          onPress={() => onChange(quantity - 1)}
          disabled={!picked}
          className={`w-8 h-8 rounded-lg items-center justify-center ${
            picked ? "bg-gray-100" : "bg-gray-50"
          }`}
        >
          <Ionicons
            name="remove"
            size={16}
            color={picked ? COLORS.gray700 : COLORS.gray300}
          />
        </PressableOpacity>
        <TextInput
          value={picked ? String(quantity) : ""}
          onChangeText={(v) => onChange(Number(v.replace(/[^0-9]/g, "")) || 0)}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={COLORS.gray400}
          className="w-10 text-center text-base text-gray-900"
          style={{ fontFamily: "Cairo" }}
        />
        <PressableOpacity
          onPress={() => onChange(quantity + 1)}
          className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
        >
          <Ionicons name="add" size={16} color={COLORS.gray700} />
        </PressableOpacity>
      </View>
    </View>
  );
}
