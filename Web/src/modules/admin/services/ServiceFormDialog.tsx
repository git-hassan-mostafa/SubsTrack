import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import TextField from "@mui/material/TextField";
import type { Service } from "@shared/core/types";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useServiceSlice } from "@shared/state/hooks/useServiceSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";

interface ServiceFormDialogProps {
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}

type ServiceForm = {
  name: string;
  description: string;
  price: number | null;
  currencyId: string | null;
  branchId: string | null;
};

export function ServiceFormDialog({ service, onClose, onSaved }: ServiceFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createService = useServiceSlice((s) => s.createService);
  const updateService = useServiceSlice((s) => s.updateService);
  const error = useServiceSlice((s) => s.error);
  const clearError = useServiceSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();
  const [form, setForm] = useState<ServiceForm>({
    name: service?.name ?? "",
    description: service?.description ?? "",
    price: service?.price ?? null,
    currencyId: service?.currencyId ?? null,
    branchId: service ? service.branchId : defaultNewBranchId(user, activeBranches),
  });
  const dirty = useDirtyForm(form, ["currencyId"]);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<ServiceForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const submit = async () => {
    if (!user) return;
    const data = {
      name: form.name,
      description: form.description.trim() || null,
      price: form.price ?? Number.NaN,
      currencyId: form.currencyId,
      branchId: form.branchId,
    };
    const saved = service
      ? await updateService(service.id, data)
      : await createService(data, user.tenantId);
    if (saved) onSaved();
  };

  return (
    <FormDialog
      open
      title={service ? t("services.edit_title") : t("web.services.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={service ? t("common.save_changes") : t("web.services.add")}
    >
      <TextField
        label={t("services.name_label")}
        value={form.name}
        onChange={(event) => change({ name: event.target.value })}
        placeholder={t("services.name_placeholder")}
        required
        autoFocus
        fullWidth
      />
      <TextField
        label={t("services.description_label")}
        value={form.description}
        onChange={(event) => change({ description: event.target.value })}
        placeholder={t("services.description_placeholder")}
        multiline
        minRows={2}
        fullWidth
      />
      <BranchPicker
        value={form.branchId}
        onChange={(branchId) => change({ branchId })}
        nullable={user?.branchId === null}
        nullLabel={t("branches.shared_all_branches")}
      />
      <CurrencyInput
        label={t("services.price_label")}
        amount={form.price}
        currencyId={form.currencyId}
        onChange={({ amount, currencyId }) => change({ price: amount, currencyId })}
        currencies={currencies}
        required
      />
    </FormDialog>
  );
}
