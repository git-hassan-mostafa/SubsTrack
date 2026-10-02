import { useEffect, useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { digitsOnly } from "@shared/core/utils/inputText";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { Product } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useProductSlice } from "@shared/state/hooks/useProductSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";

interface Props {
  product?: Product | null;
  onDismiss: () => void;
  onRequestDelete?: (product: Product) => void;
  onAdjustStock?: (product: Product) => void;
}

type FormState = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  costPrice: number | null;
  costCurrencyId: string | null;
  branchId: string | null;
  initialStock: string;
};

export function ProductFormSheet({
  product,
  onDismiss,
  onRequestDelete,
  onAdjustStock,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createProduct = useProductSlice((s) => s.createProduct);
  const updateProduct = useProductSlice((s) => s.updateProduct);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const clearError = useProductSlice((s) => s.clearError);
  const stockOnHand = useProductSlice(
    (s) =>
      s.items.find((p) => p.id === product?.id)?.stockOnHand ??
      product?.stockOnHand ??
      0,
  );
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();

  const defaultBranchId = product
    ? product.branchId
    : defaultNewBranchId(user, activeBranches);

  const branchPickerNullable = user?.branchId === null;

  const [form, setForm] = useState<FormState>({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? null,
    currencyId: product?.currencyId ?? null,
    costPrice: product?.costPrice ?? null,
    costCurrencyId: product?.costCurrencyId ?? null,
    branchId: defaultBranchId,
    initialStock: "",
  });

  const dirty = useDirtyForm(form, ["currencyId", "costCurrencyId"]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function handleSubmit() {
    if (!user) return;
    const payload = {
      name: form.name,
      description: form.description.trim() || null,
      price: form.price ?? Number.NaN,
      currencyId: form.currencyId,
      costPrice: form.costPrice,
      costCurrencyId: form.costCurrencyId,
      branchId: form.branchId,
    };
    const saved = product
      ? await updateProduct(product.id, payload)
      : await createProduct(
          { ...payload, initialStock: Number(form.initialStock) || 0 },
          user.tenantId,
          user.id,
          currencies.find((c) => c.id === form.costCurrencyId) ?? null,
        );
    if (saved) onDismiss();
  }

  const submitDisabled =
    !form.name.trim() || form.price == null || form.price <= 0 || loading;

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={product ? t("products.edit_title") : t("products.add_title")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Input
        label={t("products.name_label") + " *"}
        value={form.name}
        onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
        placeholder={t("products.name_placeholder")}
        onFocus={clearError}
      />

      <Input
        label={t("products.description_label")}
        value={form.description}
        onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
        placeholder={t("products.description_placeholder")}
        multiline
      />

      <BranchPicker
        label={t("branches.branch_label") + (branchPickerNullable ? "" : " *")}
        value={form.branchId}
        onChange={(v) => setForm((p) => ({ ...p, branchId: v }))}
        nullable={branchPickerNullable}
        nullLabel={t("branches.shared_all_branches")}
      />

      <CurrencyInput
        label={t("products.price_label") + " *"}
        amount={form.price}
        currencyId={form.currencyId}
        onChange={({ amount, currencyId }) =>
          setForm((p) => ({ ...p, price: amount, currencyId }))
        }
        currencies={currencies}
        placeholder="0.00"
        onFocus={clearError}
      />

      <CurrencyInput
        label={t("products.cost_price_label")}
        amount={form.costPrice}
        currencyId={form.costCurrencyId}
        onChange={({ amount, currencyId }) =>
          setForm((p) => ({
            ...p,
            costPrice: amount,
            costCurrencyId: currencyId,
          }))
        }
        currencies={currencies}
        placeholder="0.00"
        onFocus={clearError}
      />

      {product ? (
        <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-gray-400">
              {t("products.stock_on_hand")}
            </Text>
            <Text
              fontWeight="Bold"
              className={`text-lg ${stockOnHand > 0 ? "text-gray-900" : "text-danger"}`}
            >
              {stockOnHand}
            </Text>
          </View>
          {onAdjustStock ? (
            <PressableOpacity onPress={() => onAdjustStock(product)}>
              <Text fontWeight="SemiBold" className="text-sm text-primary">
                {t("products.adjust_stock_title")}
              </Text>
            </PressableOpacity>
          ) : null}
        </View>
      ) : (
        <Input
          label={t("products.initial_stock_label")}
          value={form.initialStock}
          onChangeText={(v) => setForm((p) => ({ ...p, initialStock: v }))}
          sanitize={digitsOnly}
          keyboardType="number-pad"
          placeholder="0"
          onFocus={clearError}
        />
      )}

      <Button
        label={product ? t("common.save_changes") : t("products.add_title")}
        onPress={handleSubmit}
        loading={loading}
        disabled={submitDisabled}
        fullWidth
      />

      {product && onRequestDelete ? (
        <>
          <PressableOpacity
            onPress={() => onRequestDelete(product)}
            className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
          >
            <Text fontWeight="SemiBold" className="text-red-500">
              {t("common.delete")}
            </Text>
          </PressableOpacity>
          <Text className="text-xs text-gray-400 text-center mt-3">
            {t("products.delete_warning")}
          </Text>
        </>
      ) : null}

      <View className="h-24" />
    </FormSheet>
  );
}
