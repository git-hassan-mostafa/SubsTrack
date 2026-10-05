import { useEffect } from "react";
import { View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Dropdown } from "@/src/shared/components/Dropdown";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import { AppTextInput } from "@/src/shared/components/AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { useHoldRepeat } from "@shared/shared/hooks/useHoldRepeat";
import { decimalDigitsOnly, digitsOnly } from "@shared/core/utils/inputText";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Product } from "@shared/core/types";
import {
  currencyChoices,
  currencyPickOptions,
  formatMoney,
} from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBatchRestockForm } from "@shared/modules/admin/products/hooks/useBatchRestockForm";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";

interface Props {
  onDismiss: () => void;
}

// Header and footer are ELEMENTS: a component identity per render steals focus.
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

  const currencies = useCurrencySlice((s) => s.items);
  const form = useBatchRestockForm(products, currencies);
  const { entries, visible, deliveryCurrency, totalUnits, totalCost } = form;
  const hasProducts = form.activeProducts.length > 0;

  useEffect(() => {
    clearError();
    void getProducts();
    return clearError;
  }, [clearError, getProducts]);

  function setQuantity(productId: string, quantity: number) {
    clearError();
    form.setQuantity(productId, quantity);
  }

  async function handleSubmit() {
    if (!user || entries.length === 0) return;
    const ok = await batchRestock(
      entries,
      user.tenantId,
      form.note,
      user.id,
      deliveryCurrency,
    );
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
            searchText={form.search}
            setSearchText={form.setSearch}
            placeholder={t("products.batch_restock_search")}
          />
          <View className="flex-row items-center justify-between mt-4 mb-2">
            <Text fontWeight="SemiBold" className="text-sm text-gray-900">
              {t("products.batch_restock_products", { count: visible.length })}
            </Text>
            {entries.length > 0 ? (
              <PressableOpacity onPress={form.clearAll} hitSlop={8}>
                <Text fontWeight="Medium" className="text-xs text-primary">
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
      <Dropdown<string>
        label={t("products.delivery_currency_label")}
        options={currencyPickOptions(
          currencyChoices(currencies, form.currencyId),
        )}
        value={form.currencyId}
        onChange={form.changeCurrency}
        nullable
        nullLabel="USD"
      />

      <Input
        label={t("products.batch_restock_note_label")}
        value={form.note}
        onChangeText={form.setNote}
        placeholder={t("products.stock_note_placeholder")}
        onFocus={clearError}
      />

      <View className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4">
        <View className="flex-row items-center justify-between">
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
        {totalCost > 0 ? (
          <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-200">
            <Text className="text-sm text-gray-500">
              {t("products.total_cost_label")}
            </Text>
            <Text fontWeight="Bold" className="text-base text-amber-700">
              {formatMoney(totalCost, deliveryCurrency, deliveryCurrency)}
            </Text>
          </View>
        ) : null}
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
    <AppBottomSheet
      visible
      onDismiss={onDismiss}
      variant="full"
      dirty={form.dirty}
      dismissOnBackdropPress={false}
    >
      {(dismiss) => (
        <ResponsiveContainer className="flex-1">
          <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900"
              numberOfLines={1}
            >
              {t("products.batch_restock_title")}
            </Text>
            <PressableOpacity onPress={dismiss}>
              <Text fontWeight="Medium" className="text-base text-primary">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </SheetDragArea>

          <BottomSheetFlatList
            data={visible}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="always"
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
                quantity={form.quantities[item.id] ?? 0}
                unitCost={form.costs[item.id] ?? ""}
                currency={deliveryCurrency}
                onChange={(q) => setQuantity(item.id, q)}
                onCostChange={(c) => form.setCost(item.id, c)}
              />
            )}
          />
        </ResponsiveContainer>
      )}
    </AppBottomSheet>
  );
}

function quantityText(quantity: number): string {
  return quantity > 0 ? String(quantity) : "";
}

interface RowProps {
  product: Product;
  quantity: number;
  unitCost: string;
  currency: Currency | null;
  onChange: (quantity: number) => void;
  onCostChange: (unitCost: string) => void;
}

// A picked row turns indigo and previews its stock without reordering the list.
function RestockRow({
  product,
  quantity,
  unitCost,
  currency,
  onChange,
  onCostChange,
}: RowProps) {
  const { t } = useTranslation();
  const picked = quantity > 0;
  const quantityField = useTextField(
    quantityText(quantity),
    (next) => onChange(Number(next) || 0),
    {
      sanitize: digitsOnly,
      expectedEcho: (next) => quantityText(Number(next) || 0),
    },
  );
  const costField = useTextField(unitCost, onCostChange, {
    sanitize: decimalDigitsOnly,
  });
  const holdDown = useHoldRepeat(() => onChange(quantity - 1));
  const holdUp = useHoldRepeat(() => onChange(quantity + 1));

  return (
    <View
      className={`rounded-2xl border px-3 py-2 mb-2 ${
        picked ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"
      }`}
    >
      <View className="flex-row items-center">
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
            {...holdDown}
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
          <AppTextInput
            {...quantityField}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={COLORS.gray400}
            containerClassName="w-10"
            className="text-center text-base text-gray-900"
          />
          <PressableOpacity
            onPress={() => onChange(quantity + 1)}
            {...holdUp}
            className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center"
          >
            <Ionicons name="add" size={16} color={COLORS.gray700} />
          </PressableOpacity>
        </View>
      </View>

      {picked ? (
        <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-indigo-100">
          <Text className="text-xs text-gray-500">
            {t("products.cost_per_unit_label")}
          </Text>
          <View className="flex-row items-center">
            <AppTextInput
              {...costField}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={COLORS.gray400}
              containerClassName="w-20"
              className="text-end text-sm text-gray-900"
            />
            <Text className="text-xs text-gray-400 ms-1">
              {currency?.symbol ?? currency?.code ?? "$"}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
