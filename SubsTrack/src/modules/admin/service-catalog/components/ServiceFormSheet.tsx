import { useEffect, useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { Service } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useServiceSlice } from "@shared/state/hooks/useServiceSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import {
  canSaveService,
  serviceDraftOf,
  serviceInput,
} from "@shared/modules/admin/service-catalog/utils/serviceForm";

interface Props {
  service?: Service | null;
  onDismiss: () => void;
  onRequestDelete?: (service: Service) => void;
  onSaved?: (service: Service) => void;
}

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

  const branchPickerNullable = user?.branchId === null;

  const [form, setForm] = useState(() =>
    serviceDraftOf(service ?? null, defaultNewBranchId(user, activeBranches)),
  );

  const dirty = useDirtyForm(form, ["currencyId"]);

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function handleSubmit() {
    if (!user || !canSaveService(form)) return;
    const payload = serviceInput(form);
    const saved = service
      ? await updateService(service.id, payload)
      : await createService(payload, user.tenantId);
    if (!saved) return;
    onSaved?.(saved);
    onDismiss();
  }

  const submitDisabled = !canSaveService(form) || loading;

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
            <Text fontWeight="SemiBold" className="text-red-500">
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
