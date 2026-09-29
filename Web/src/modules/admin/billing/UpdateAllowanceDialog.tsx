import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useAllowanceForm } from "@shared/modules/admin/billing/hooks/useAllowanceForm";
import {
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
} from "@shared/modules/admin/billing/utils/types";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useSupportWhatsAppNumber } from "@shared/state/hooks/useOptionSlice";
import { FormDialog } from "@/shared/components/FormDialog";
import { openWhatsApp } from "@/shared/lib/openWhatsApp";
import { AllowanceField } from "./AllowanceField";

interface UpdateAllowanceDialogProps {
  editing: boolean;
  onClose: () => void;
}

// Save stays enabled: an invalid change is explained where it is typed.
export function UpdateAllowanceDialog({ editing, onClose }: UpdateAllowanceDialogProps) {
  const { t } = useTranslation();
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const supportNumber = useSupportWhatsAppNumber();
  const form = useAllowanceForm(editing);
  const { total, limits, active, draft } = form;
  const overKind = draft.overCap[0];

  const [triedUnchanged, setTriedUnchanged] = useState(false);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const change = (apply: (next: number) => void) => (next: number) => {
    clearError();
    setTriedUnchanged(false);
    apply(next);
  };

  const submit = async (alsoWhatsApp: boolean) => {
    if (!editing && !form.dirty) {
      setTriedUnchanged(true);
      return;
    }
    if (!draft.valid) return;
    if (!form.sendsRequest) {
      if (await form.lower()) onClose();
      return;
    }
    const extra = await form.send();
    if (!extra) return;
    if (alsoWhatsApp) openWhatsApp(supportNumber, form.requestMessage(extra));
    onClose();
  };

  const submitLabel = editing
    ? t("billing.save_request")
    : draft.raising
      ? t("billing.send_request")
      : t("billing.decrease_save");

  return (
    <FormDialog
      open
      title={editing ? t("billing.edit_request") : t("billing.update_number")}
      onClose={onClose}
      onSubmit={() => submit(false)}
      dirty={form.dirty}
      error={error ?? (triedUnchanged ? t("web.organization.no_change") : null)}
      onDismissError={() => {
        clearError();
        setTriedUnchanged(false);
      }}
      submitLabel={submitLabel}
      secondarySubmit={
        form.sendsRequest && supportNumber
          ? { label: t("billing.send_request_whatsapp"), onSubmit: () => submit(true) }
          : undefined
      }
    >
      <Paper variant="outlined" sx={{ px: 2, py: 1.5, bgcolor: "background.default" }}>
        <Typography variant="body2" color="text.secondary">
          {t("billing.current_limits")}
        </Typography>
        <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
          {t("billing.current_limits_value", {
            customers: limits.customers,
            plans: limits.plans,
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("billing.active_now", { customers: active.customers, plans: active.plans })}
        </Typography>
      </Paper>

      <AllowanceField
        label={t("billing.allowed_customers")}
        current={limits.customers}
        value={total.customers}
        floor={form.floor("customers")}
        error={form.fieldError("customers")}
        onChange={change(form.setCustomers)}
      />
      <AllowanceField
        label={t("billing.allowed_plans")}
        current={limits.plans}
        value={total.plans}
        floor={form.floor("plans")}
        error={form.fieldError("plans")}
        onChange={change(form.setPlans)}
      />

      {form.formError ? (
        <Typography variant="body2" color="error" role="alert">
          {form.formError}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {editing
            ? t("billing.request_hint", { min: MIN_CUSTOMER_REQUEST })
            : t("billing.update_number_explainer", {
                min: MIN_CUSTOMER_REQUEST,
                floor: MIN_CUSTOMER_ALLOWANCE,
              })}
        </Typography>
      )}

      {overKind ? (
        <Alert severity="warning">
          <AlertTitle>{t("billing.decrease_deactivate_title")}</AlertTitle>
          {t(`billing.decrease_deactivate_body_${overKind}`, {
            count: active[overKind] - total[overKind],
          })}
        </Alert>
      ) : null}

      {draft.lowering && !overKind ? (
        <Typography variant="body2" color="text.secondary">
          {t("billing.decrease_billing_note", { amount: form.loweredAmountUsd.toFixed(2) })}
        </Typography>
      ) : null}

      {draft.raising && !draft.tooSmallRaise && !draft.mixed ? (
        <Typography variant="body2" color="text.secondary">
          {t("billing.raise_needs_approval", { ask: form.askText })}
        </Typography>
      ) : null}
    </FormDialog>
  );
}
