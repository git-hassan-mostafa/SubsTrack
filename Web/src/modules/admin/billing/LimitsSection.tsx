import { useState } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import { askText, requestedPair } from "@shared/modules/admin/billing/utils/requestAsk";
import { confirm } from "@shared/shared/lib/confirm";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { SettingsSection } from "@/modules/admin/tenant-settings/SettingsSection";
import { UpdateAllowanceDialog } from "./UpdateAllowanceDialog";
import { UsageMeter } from "./UsageMeter";

// A pending request replaces the Update button: one open ask at a time.
export function LimitsSection() {
  const { t } = useTranslation();
  const limits = useBillingSlice((s) => s.limits);
  const price = useBillingSlice((s) => s.pricePerPlanUsd);
  const active = useBillingSlice((s) => s.active);
  const request = useBillingSlice((s) => s.request);
  const saving = useBillingSlice((s) => s.saving);
  const cancelRequest = useBillingSlice((s) => s.cancelRequest);
  const error = useBillingSlice((s) => s.error);
  const clearError = useBillingSlice((s) => s.clearError);
  const [dialog, setDialog] = useState<"update" | "edit" | null>(null);

  const pending = request?.status === "pending" ? request : null;
  const declined = request?.status === "declined" ? request : null;
  const pendingAsk = pending ? askText(t, requestedPair(pending)) : "";

  const confirmCancel = () =>
    confirm({
      title: t("billing.cancel_confirm_title"),
      message: t("billing.cancel_confirm_body", { ask: pendingAsk }),
      confirmLabel: t("billing.cancel_request"),
      destructive: true,
      onConfirm: async () => {
        await cancelRequest();
      },
    });

  return (
    <SettingsSection title={t("web.organization.limits_title")}>
      <ErrorBanner message={dialog ? null : error} onDismiss={clearError} />
      <UsageMeter kind="customers" used={active.customers} total={limits.customers} />
      <Divider />
      <UsageMeter kind="plans" used={active.plans} total={limits.plans} />
      <Divider />
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack>
          <Typography variant="body2">{t("billing.monthly_amount")}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("billing.amount_note", { count: limits.plans, price: price.toString() })}
          </Typography>
        </Stack>
        <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
          {`$${billingService.monthlyAmountUsd(limits.plans, price).toFixed(2)}`}
        </Typography>
      </Stack>

      {pending ? (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" disabled={saving} onClick={() => setDialog("edit")}>
                {t("billing.edit_request")}
              </Button>
              <Button color="error" size="small" disabled={saving} onClick={() => void confirmCancel()}>
                {t("billing.cancel_request")}
              </Button>
            </Stack>
          }
        >
          <AlertTitle>{t("billing.pending_title")}</AlertTitle>
          {t("billing.pending_body", { ask: pendingAsk })}
        </Alert>
      ) : (
        <>
          {declined ? (
            <Alert severity="error">
              <AlertTitle>{t("billing.declined_title")}</AlertTitle>
              {t("billing.declined_body", { ask: askText(t, requestedPair(declined)) })}
            </Alert>
          ) : null}
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Button variant="contained" onClick={() => setDialog("update")}>
              {t("billing.update_number")}
            </Button>
            <Typography variant="body2" color="text.secondary">
              {t("billing.update_number_hint", {
                count: Math.max(0, limits.plans - active.plans),
              })}
            </Typography>
          </Stack>
        </>
      )}

      {dialog ? (
        <UpdateAllowanceDialog editing={dialog === "edit"} onClose={() => setDialog(null)} />
      ) : null}
    </SettingsSection>
  );
}
