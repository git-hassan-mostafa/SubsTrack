import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import type { Plan } from "@shared/core/types";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { usePlanPriceHistory } from "@shared/modules/admin/plans/hooks/usePlanPriceHistory";
import { usePlanPrepaidLock } from "@shared/modules/admin/plans/hooks/usePlanPrepaidLock";
import {
  canSavePlan,
  isMultiMonthPlan,
  isPlanFormDirty,
  MAX_PLAN_DURATION,
  planBillingTypeOf,
  planDraftOf,
  planInput,
  withBillingType,
  withPlanDuration,
  withPlanUsage,
  type PlanBillingType,
  type PlanDraft,
} from "@shared/modules/admin/plans/utils/planForm";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  currentBillingMonth,
  planPriceChanged,
} from "@shared/modules/customer/customer-plans/utils/priceHistory";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { planDurationLabel } from "@shared/modules/admin/plans/utils/planLabels";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { FormDialog } from "@/shared/components/FormDialog";
import { PriceStartField } from "@/shared/components/PriceStartField";
import { markCustomersTableStale } from "@/state/customersTable";
import { PlanPriceHistory } from "./PlanPriceHistory";
import { PlanUsageFields } from "./PlanUsageFields";
import { UsagePriceHistory } from "./UsagePriceHistory";

const DURATIONS = Array.from({ length: MAX_PLAN_DURATION }, (_, i) => i + 1);
const BILLING_TYPES: PlanBillingType[] = ["fixed", "usage"];

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

  const historyState = usePlanPriceHistory(plan?.id, markCustomersTableStale);
  const prepaidLocked = usePlanPrepaidLock(plan?.id);

  const [form, setForm] = useState(() =>
    planDraftOf(plan, defaultNewBranchId(user, activeBranches)),
  );
  const [customPriceFrom, setCustomPriceFrom] = useState<string | null>(null);
  const dirty = useDirtyForm(form, ["currencyId"]);
  const isMultiMonth = isMultiMonthPlan(form);
  const priceChanged = plan && !form.usage ? planPriceChanged(plan, planInput(form)) : false;
  const priceFrom = customPriceFrom ?? currentBillingMonth();

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (patch: Partial<PlanDraft>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (error) clearError();
  };

  const reshape = (next: (prev: PlanDraft) => PlanDraft) => {
    setForm(next);
    if (error) clearError();
  };

  const isDirty = isPlanFormDirty(dirty, priceChanged, customPriceFrom);

  const submit = async () => {
    if (!user || !canSavePlan(form)) return;
    const data = planInput(form);
    const saved = plan
      ? await updatePlan(plan, data, priceFrom)
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
      dirty={isDirty}
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
      <Stack spacing={1}>
        <FormLabel id="plan-billing-type-label">{t("plans.billing_type_label")}</FormLabel>
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={planBillingTypeOf(form)}
          onChange={(_event, type: PlanBillingType | null) => {
            if (type) reshape((prev) => withBillingType(prev, type));
          }}
          disabled={plan !== null}
          aria-labelledby="plan-billing-type-label"
        >
          {BILLING_TYPES.map((type) => (
            <ToggleButton key={type} value={type} sx={{ px: 3 }}>
              {type === "usage" ? t("plans.billing_usage") : t("plans.billing_fixed")}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {plan ? <FormHelperText>{t("plans.billing_type_locked_hint")}</FormHelperText> : null}
      </Stack>
      {form.usage ? (
        <PlanUsageFields
          usage={form.usage}
          currencyId={form.currencyId}
          currencies={currencies}
          entryLocked={!!plan?.usage}
          onChange={(patch) => reshape((prev) => withPlanUsage(prev, patch))}
          onCurrencyChange={(currencyId) => change({ currencyId })}
        />
      ) : (
        <>
          <TextField
            select
            label={t("plans.duration_label")}
            value={form.durationMonths}
            onChange={(event) =>
              reshape((prev) => withPlanDuration(prev, Number(event.target.value)))
            }
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
          {priceChanged ? (
            <PriceStartField
              value={priceFrom}
              onChange={(month) => setCustomPriceFrom(month)}
            />
          ) : null}
          <FormControlLabel
            disabled={prepaidLocked}
            control={
              <Switch
                checked={form.prepaid}
                onChange={(event) => change({ prepaid: event.target.checked })}
              />
            }
            label={
              <>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t("plans.prepaid_label")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {prepaidLocked ? t("plans.prepaid_locked_hint") : t("plans.prepaid_hint")}
                </Typography>
              </>
            }
          />
        </>
      )}
      {plan?.usage ? (
        <UsagePriceHistory
          usage={plan.usage}
          currencies={currencies}
          sortedHistory={historyState.sortedHistory}
          loading={historyState.loading}
          error={historyState.error}
          clearError={historyState.clearError}
        />
      ) : plan ? (
        <PlanPriceHistory
          plan={plan}
          currencies={currencies}
          {...historyState}
        />
      ) : null}
    </FormDialog>
  );
}
