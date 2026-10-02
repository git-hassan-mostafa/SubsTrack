import { useTranslation } from "react-i18next";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { Customer } from "@shared/core/types";
import { useCustomerForm } from "@shared/modules/customer/customers/hooks/useCustomerForm";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useCustomerPortalUrl } from "@shared/state/hooks/useOptionSlice";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { FormDialog } from "@/shared/components/FormDialog";
import { QuotaReachedDialog } from "@/modules/admin/billing/QuotaReachedDialog";
import { HardDeleteChoice } from "@/modules/customer/customer-plans/HardDeleteChoice";
import { ServiceLinesEditor } from "@/modules/customer/customer-plans/ServiceLinesEditor";
import { patchCustomerRow } from "@/state/customersTable";
import { markSalesTableStale } from "@/state/salesTable";
import { PortalAccessField } from "./PortalAccessField";

interface CustomerFormDialogProps {
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

const hardDeleteChoice = (onChange: (hardDelete: boolean) => void) => (
  <HardDeleteChoice onChange={onChange} />
);

// A limit refusal opens its own dialog on top and keeps this form's typing.
export function CustomerFormDialog({ customer, onClose, onSaved }: CustomerFormDialogProps) {
  const { t } = useTranslation();
  const quotaError = useBillingSlice((s) => s.quotaError);
  const clearQuotaError = useBillingSlice((s) => s.clearQuotaError);
  const portalBaseUrl = useCustomerPortalUrl();
  const { form, change, lines, dirty, error, clearError, submit } = useCustomerForm(
    customer,
    hardDeleteChoice,
  );

  const save = async () => {
    const saved = await submit();
    if (!saved) return;
    void patchCustomerRow(saved.id, customer === null);
    if (customer && customer.name !== saved.name) markSalesTableStale();
    onSaved(saved);
  };

  return (
    <>
      <FormDialog
        open
        title={customer ? t("customers.edit_title") : t("customers.add_title")}
        onClose={onClose}
        onSubmit={save}
        dirty={dirty}
        error={error}
        onDismissError={clearError}
        submitLabel={customer ? t("common.save_changes") : t("customers.add_title")}
        maxWidth="md"
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={t("customers.name_label")}
            value={form.name}
            onChange={(event) => change({ name: event.target.value })}
            placeholder={t("customers.name_placeholder")}
            required
            autoFocus
            fullWidth
          />
          <TextField
            label={t("customers.phone_label")}
            value={form.phoneNumber}
            onChange={(event) => change({ phoneNumber: event.target.value })}
            placeholder={t("customers.phone_placeholder")}
            fullWidth
            slotProps={{ htmlInput: { inputMode: "tel" } }}
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label={t("customers.address_label")}
            value={form.address}
            onChange={(event) => change({ address: event.target.value })}
            placeholder={t("common.optional")}
            fullWidth
          />
          <TextField
            label={t("customers.area_label")}
            value={form.area}
            onChange={(event) => change({ area: event.target.value })}
            placeholder={t("customers.area_placeholder")}
            fullWidth
          />
        </Stack>
        <TextField
          label={t("customers.location_label")}
          value={form.locationUrl}
          onChange={(event) => change({ locationUrl: event.target.value })}
          placeholder={t("customers.location_placeholder")}
          helperText={form.locationUrl.trim() ? t("customers.location_saved") : undefined}
          fullWidth
          slotProps={{ htmlInput: { inputMode: "url", autoCapitalize: "none" } }}
        />
        <BranchPicker
          value={form.branchId}
          onChange={(branchId) => change({ branchId })}
          nullLabel={t("branches.unassigned")}
          nullable={false}
        />
        <Divider />
        <ServiceLinesEditor drafts={lines} branchId={form.branchId} />
        <Divider />
        <TextField
          label={t("customers.notes_label")}
          value={form.notes}
          onChange={(event) => change({ notes: event.target.value })}
          placeholder={t("customers.notes_placeholder")}
          multiline
          minRows={2}
          fullWidth
        />
        <FormControlLabel
          sx={{ alignItems: "flex-start", mx: 0, justifyContent: "space-between" }}
          labelPlacement="start"
          control={
            <Switch
              checked={form.isRegular}
              onChange={(event) => change({ isRegular: event.target.checked })}
            />
          }
          label={
            <span>
              <Typography sx={{ fontWeight: 600 }}>{t("customers.regular_label")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t("customers.regular_hint")}
              </Typography>
            </span>
          }
        />
        <PortalAccessField
          customerId={customer?.id ?? null}
          portalBaseUrl={portalBaseUrl}
          enabled={form.portalEnabled}
          password={form.portalPassword}
          onChange={change}
        />
      </FormDialog>
      <QuotaReachedDialog payload={quotaError} onClose={clearQuotaError} onNavigate={onClose} />
    </>
  );
}
