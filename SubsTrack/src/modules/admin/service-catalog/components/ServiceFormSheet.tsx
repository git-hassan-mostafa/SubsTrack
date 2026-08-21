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
import type { Service } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useServiceSlice } from "@/src/state/hooks/useServiceSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useActiveBranches } from "@/src/modules/admin/branches";
import { getStore } from "@/src/state/globalStore";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";

interface Props {
  service?: Service | null;
  onDismiss: () => void;
  onRequestDelete?: (service: Service) => void;
  // Called with the saved row, so a caller that opened this from a sale line can
  // select what it just created.
  onSaved?: (service: Service) => void;
}

type FormState = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  branchId: string | null;
};

export function ServiceFormSheet({
  service,
  onDismiss,
  onRequestDelete,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createService = useServiceSlice((s) => s.createService);
  const updateService = useServiceSlice((s) => s.updateService);
  const loading = useServiceSlice((s) => s.loading);
  const error = useServiceSlice((s) => s.error);
  const clearError = useServiceSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();

  // Same branch defaulting as products: a branch-scoped user's services bind to
  // their branch, a single-branch tenant picks the only one, and a tenant-wide
  // admin may leave it Shared (null).
  const defaultBranchId = (() => {
    if (service) return service.branchId;
    if (user?.branchId) return user.branchId;
    if (activeBranches.length === 1) return activeBranches[0].id;
    return null;
  })();

  const branchPickerNullable = user?.branchId === null;

  const [form, setForm] = useState<FormState>({
    name: service?.name ?? "",
    description: service?.description ?? "",
    price: service?.price ?? null,
    currencyId: service?.currencyId ?? null,
    branchId: defaultBranchId,
  });

  // CurrencyInput self-seeds `currencyId` from the last-used currency after
  // mount, so it changes with no user action — ignore it in the dirty check.
  const dirty = useDirtyForm(form, ["currencyId"]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function handleSubmit() {
    if (!user) return;
    const payload = {
      name: form.name,
      description: form.description.trim() || null,
      price: form.price ?? 0,
      currencyId: form.currencyId,
      branchId: form.branchId,
    };
    const saved = service
      ? await updateService(service.id, payload)
      : await createService(payload, user.tenantId);
    if (!getStore().getState().services.error) {
      if (saved) onSaved?.(saved);
      onDismiss();
    }
  }

  const submitDisabled =
    !form.name.trim() || form.price == null || form.price <= 0 || loading;

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={dirty}
      title={service ? t("services.edit_title") : t("services.add_title")}
    >
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Input
        label={t("services.name_label") + " *"}
        value={form.name}
        onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
        placeholder={t("services.name_placeholder")}
        onFocus={clearError}
      />

      <Input
        label={t("services.description_label")}
        value={form.description}
        onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
        placeholder={t("services.description_placeholder")}
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
        label={t("services.price_label") + " *"}
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
        label={service ? t("common.save_changes") : t("services.add_title")}
        onPress={handleSubmit}
        loading={loading}
        disabled={submitDisabled}
        fullWidth
      />

      {service && onRequestDelete ? (
        <>
          <PressableOpacity
            onPress={() => onRequestDelete(service)}
            className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
          >
            <Text className="text-red-500 font-semibold">
              {t("common.delete")}
            </Text>
          </PressableOpacity>
          <Text className="text-xs text-gray-400 text-center mt-3">
            {t("services.delete_warning")}
          </Text>
        </>
      ) : null}

      <View className="h-24" />
    </FormSheet>
  );
}
