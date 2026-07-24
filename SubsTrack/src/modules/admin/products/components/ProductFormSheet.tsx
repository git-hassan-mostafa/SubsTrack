import { useEffect, useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { Product } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useProductSlice } from "@/src/state/hooks/useProductSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import { useActiveBranches } from "@/src/modules/admin/branches";
import { getStore } from "@/src/state/globalStore";
import { UpgradePromptModal } from "@/src/modules/admin/subscription";

interface Props {
  product?: Product | null;
  onDismiss: () => void;
  onRequestDelete?: (product: Product) => void;
}

type FormState = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  branchId: string | null;
};

export function ProductFormSheet({
  product,
  onDismiss,
  onRequestDelete,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createProduct = useProductSlice((s) => s.createProduct);
  const updateProduct = useProductSlice((s) => s.updateProduct);
  const loading = useProductSlice((s) => s.loading);
  const error = useProductSlice((s) => s.error);
  const tierLimitError = useProductSlice((s) => s.tierLimitError);
  const clearError = useProductSlice((s) => s.clearError);
  const clearTierLimitError = useProductSlice((s) => s.clearTierLimitError);
  const currencies = useCurrencySlice((s) => s.items);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const usage = useSubscriptionSlice((s) => s.usage);
  const activeBranches = useActiveBranches();

  // For new products: branch-scoped admin's products bind to their branch;
  // single-branch tenant picks the only branch; multi-branch tenant-wide admin
  // can leave it as Shared (null) — products mirror plan branch semantics.
  const defaultBranchId = (() => {
    if (product) return product.branchId;
    if (user?.branchId) return user.branchId;
    if (activeBranches.length === 1) return activeBranches[0].id;
    return null;
  })();

  // Tenant-wide admins can create SHARED products (null branch_id). Branch-scoped
  // users always submit their own branch and the picker is locked + hidden.
  const branchPickerNullable = user?.branchId === null;

  const [form, setForm] = useState<FormState>({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? null,
    currencyId: product?.currencyId ?? null,
    branchId: defaultBranchId,
  });

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user || !currentTier) return;
    const payload = {
      name: form.name,
      description: form.description.trim() || null,
      price: form.price ?? 0,
      currencyId: form.currencyId,
      branchId: form.branchId,
    };
    if (product) {
      await updateProduct(product.id, payload);
    } else {
      await createProduct(payload, user.tenantId, currentTier, usage);
    }
    const { error: nextError, tierLimitError: nextTier } =
      getStore().getState().products;
    if (!nextError && !nextTier) onDismiss();
  }

  const submitDisabled =
    !form.name.trim() || form.price == null || form.price <= 0 || loading;

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
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
          label={
            t("branches.branch_label") + (branchPickerNullable ? "" : " *")
          }
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
              <Text className="text-red-500 font-semibold">
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
      <UpgradePromptModal
        payload={tierLimitError}
        onClose={() => {
          clearTierLimitError();
          onDismiss();
        }}
      />
    </>
  );
}
