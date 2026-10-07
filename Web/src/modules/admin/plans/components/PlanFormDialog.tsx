import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Plan } from "@shared/core/types";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import {
  canSavePlan,
  isMultiMonthPlan,
  MAX_PLAN_DURATION,
  planDraftOf,
  planInput,
  withPlanDuration,
  type PlanDraft,
} from "@shared/modules/admin/plans/utils/planForm";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { planDurationLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";
import { markCustomersTableStale } from "@/state/customersTable";

const DURATIONS = Array.from({ length: MAX_PLAN_DURATION }, (_, i) => i + 1);

interface PlanFormDialogProps {
  plan: Plan | null;
  onClose: () => void;
  onSaved: (saved: Plan) => void;
}

export function PlanFormDialog({ plan, onClose, onSaved }: PlanFormDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const createPlan = usePlanSlice((s) => s.createPlan);
  const updatePlan = usePlanSlice((s) => s.updatePlan);
  const error = usePlanSlice((s) => s.error);
  const clearError = usePlanSlice((s) => s.clearError);
  const currencies = useCurrencySlice((s) => s.items);
  const activeBranches = useActiveBranches();
  const [form, setForm] = useState(() =>
    planDraftOf(plan, defaultNewBranchId(user, activeBranches)),
  );
  const dirty = useDirtyForm(form, ["currencyId"]);
  const isMultiMonth = isMultiMonthPlan(form);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<PlanDraft>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const changeDuration = (months: number) => {
    setForm((prev) => withPlanDuration(prev, months));
    if (error) clearError();
  };

  const submit = async () => {
    if (!user || !canSavePlan(form)) return;
    const data = planInput(form);
    const saved = plan
      ? await updatePlan(plan.id, data)
      : await createPlan(data, user.tenantId);
    if (!saved) return;
    if (plan) markCustomersTableStale();
    onSaved(saved);
  };

  return (
    <FormDialog
      open
      title={plan ? t("plans.edit_title") : t("web.plans.add")}
      onClose={onClose}
      onSubmit={submit}
      dirty={dirty}
      error={error}
      onDismissError={clearError}
      submitLabel={plan ? t("common.save_changes") : t("web.plans.add")}
      submitDisabled={!canSavePlan(form)}
    >
      <TextField
        label={t("plans.plan_name_label")}
        value={form.name}
        onChange={(event) => change({ name: event.target.value })}
        placeholder={t("plans.plan_name_placeholder")}
        required
        autoFocus
        fullWidth
      />
      <BranchPicker
        value={form.branchId}
        onChange={(branchId) => change({ branchId })}
        nullLabel={t("branches.shared_all_branches")}
      />
      <TextField
        select
        label={t("plans.duration_label")}
        value={form.durationMonths}
        onChange={(event) => changeDuration(Number(event.target.value))}
        helperText={isMultiMonth ? t("plans.bundle_price_hint") : t("plans.per_month")}
        fullWidth
      >
        {DURATIONS.map((months) => (
          <MenuItem key={months} value={months}>
            {planDurationLabel(months, t)}
          </MenuItem>
        ))}
      </TextField>
      {isMultiMonth ? null : (
        <FormControlLabel
          control={
            <Switch
              checked={form.isCustomPrice}
              onChange={(event) => change({ isCustomPrice: event.target.checked })}
            />
          }
          label={
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t("plans.custom_pricing_label")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("plans.custom_pricing_hint")}
              </Typography>
            </>
          }
        />
      )}
      {form.isCustomPrice ? null : (
        <CurrencyInput
          label={isMultiMonth ? t("plans.bundle_price_label") : t("plans.price_label")}
          amount={form.price}
          currencyId={form.currencyId}
          onChange={({ amount, currencyId }) => change({ price: amount, currencyId })}
          currencies={currencies}
          required
        />
      )}
    </FormDialog>
  );
}
