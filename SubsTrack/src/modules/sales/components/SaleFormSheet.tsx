import { useEffect, useMemo, useState } from "react";
import { Modal, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  Dropdown,
  type DropdownOption,
} from "@/src/shared/components/Dropdown";
import { CustomerPicker } from "@/src/modules/customers/components/CustomerPicker";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import type { Customer, Product } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useSaleSlice } from "@/src/state/hooks/useSaleSlice";
import { findCurrency } from "@/src/core/utils/currency";

interface Props {
  // Optional pre-selected customer (used when launched from CustomerDetailScreen).
  // Walk-in flow leaves this null.
  initialCustomer?: Customer | null;
  onDismiss: () => void;
  onCreated?: () => void;
}

export function SaleFormSheet({
  initialCustomer,
  onDismiss,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const products = useProductSlice((s) => s.items);
  const fetchProducts = useProductSlice((s) => s.fetchProducts);
  const currencies = useCurrencySlice((s) => s.items);
  const createSale = useSaleSlice((s) => s.createSale);
  const loading = useSaleSlice((s) => s.loading);
  const error = useSaleSlice((s) => s.error);
  const clearError = useSaleSlice((s) => s.clearError);

  const [productId, setProductId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(
    initialCustomer ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [unitAmount, setUnitAmount] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Load active products on first open so the dropdown is populated immediately.
  useEffect(() => {
    if (products.length === 0) void fetchProducts();
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active),
    [products],
  );

  const selectedProduct: Product | null = useMemo(
    () => activeProducts.find((p) => p.id === productId) ?? null,
    [activeProducts, productId],
  );

  // Pre-fill amount + currency from the product when one is picked.
  // The user can override either field afterwards (discounts, rounding).
  useEffect(() => {
    if (selectedProduct) {
      setUnitAmount(selectedProduct.price);
      setCurrencyId(selectedProduct.currencyId);
    }
  }, [selectedProduct]);

  const productOptions: DropdownOption<string>[] = activeProducts.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  async function handleSubmit() {
    if (!user || !selectedProduct) return;
    const branchId = customer?.branchId ?? user.branchId ?? null;
    const sale = await createSale({
      product: selectedProduct,
      customerId: customer?.id ?? null,
      branchId,
      quantity,
      unitAmount: unitAmount ?? 0,
      currency: findCurrency(currencies, currencyId),
      recordedByUserId: user.id,
      tenantId: user.tenantId,
      notes: notes.trim() || null,
    });
    if (sale) {
      onCreated?.();
      onDismiss();
    }
  }

  const submitDisabled =
    !selectedProduct ||
    quantity <= 0 ||
    unitAmount == null ||
    unitAmount <= 0 ||
    loading;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView className="flex-1 bg-white">
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {t("sales.record_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">
              {t("common.cancel")}
            </Text>
          </PressableOpacity>
        </View>

        <KeyboardAwareScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 48 }}
          bottomOffset={24}
        >
          {error ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <Dropdown<string>
            label={t("sales.product_label") + " *"}
            placeholder={t("sales.product_placeholder")}
            options={productOptions}
            value={productId}
            onChange={(v) => setProductId(v)}
          />

          {!initialCustomer ? (
            <CustomerPicker
              label={t("sales.customer_label")}
              placeholder={t("sales.walk_in")}
              value={customer}
              onChange={setCustomer}
              nullable
              nullLabel={t("sales.walk_in")}
            />
          ) : (
            <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
              <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {t("sales.customer_label")}
              </Text>
              <Text className="text-base text-gray-900 font-medium">
                {customer?.name}
              </Text>
            </View>
          )}

          {/* Quantity stepper */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {t("sales.quantity_label")}
            </Text>
            <View className="flex-row items-center justify-between px-4 py-2.5 border border-gray-200 rounded-xl">
              <Text className="text-base text-gray-900">{quantity}</Text>
              <View className="flex-row items-center">
                <PressableOpacity
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Ionicons name="remove" size={18} color={COLORS.gray700} />
                </PressableOpacity>
                <Text className="text-base font-semibold text-gray-900 w-10 text-center">
                  {quantity}
                </Text>
                <PressableOpacity
                  onPress={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 rounded-lg bg-gray-100 items-center justify-center"
                >
                  <Ionicons name="add" size={18} color={COLORS.gray700} />
                </PressableOpacity>
              </View>
            </View>
          </View>

          <CurrencyInput
            label={t("sales.unit_amount_label") + " *"}
            amount={unitAmount}
            currencyId={currencyId}
            onChange={({ amount, currencyId: c }) => {
              setUnitAmount(amount);
              setCurrencyId(c);
            }}
            currencies={currencies}
            placeholder="0.00"
            onFocus={clearError}
          />

          {/* Total preview when quantity > 1 */}
          {quantity > 1 && unitAmount != null && unitAmount > 0 ? (
            <View className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 flex-row items-center justify-between">
              <Text className="text-sm text-emerald-700 font-medium">
                {t("sales.total_label")}
              </Text>
              <Text className="text-base text-emerald-700 font-bold">
                {(unitAmount * quantity).toFixed(2)}
              </Text>
            </View>
          ) : null}

          <Input
            label={t("sales.notes_label")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("sales.notes_placeholder")}
            multiline
          />

          <Button
            label={t("sales.record_button")}
            onPress={handleSubmit}
            loading={loading}
            disabled={submitDisabled}
            fullWidth
          />

          <View className="h-24" />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </Modal>
  );
}
