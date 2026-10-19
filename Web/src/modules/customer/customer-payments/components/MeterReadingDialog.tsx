import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { CustomerPlan } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import { useMeterReading } from "@shared/modules/customer/customer-payments/hooks/useMeterReading";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { AmountField } from "@/shared/components/AmountField";
import { FormDialog } from "@/shared/components/FormDialog";
import { InfoRows } from "@/shared/components/InfoRows";

interface MeterReadingDialogProps {
  line: CustomerPlan;
  billingMonth: string;
  onClose: () => void;
}

export function MeterReadingDialog({ line, billingMonth, onClose }: MeterReadingDialogProps) {
  const { t } = useTranslation();
  const form = useMeterReading(line, billingMonth);
  const { text, draft, locked } = form;
  if (!text) return null;
  const meter = form.entry === "reading";
  const change = draft.meterChange;

  const close = () => {
    form.clearError();
    onClose();
  };

  const submit = async () => {
    if (await form.save()) onClose();
  };

  const remove = async () => {
    if (await form.remove()) onClose();
  };

  return (
    <FormDialog
      open
      title={text.title}
      subtitle={lineLabel(line, t("common.no_plan"))}
      onClose={close}
      onSubmit={submit}
      dirty={form.dirty}
      error={form.error}
      onDismissError={form.clearError}
      submitLabel={t("common.save")}
      submitDisabled={!form.canSave}
      maxWidth="xs"
    >
      {locked ? (
        <Typography variant="body2" color="text.secondary">
          {text.locked}
        </Typography>
      ) : null}
      <InfoRows
        rows={[
          { label: t("payments.reading.meter_number"), value: meter ? form.meterNumber : null },
          { label: t("payments.reading.previous"), value: text.previous },
          {
            label: t("payments.reading.saved_on"),
            value: form.saved ? formatDateTime(form.saved.recordedAt) : null,
          },
        ]}
      />
      <AmountField
        label={text.valueLabel}
        value={draft.value}
        onChange={form.setValue}
        onFocus={form.clearError}
        disabled={locked}
        autoFocus={!locked}
        fullWidth
      />
      {meter ? (
        <FormControlLabel
          control={
            <Checkbox
              checked={!!change}
              onChange={(event) => form.setMeterReplaced(event.target.checked)}
              disabled={locked}
            />
          }
          label={t("payments.reading.meter_replaced")}
        />
      ) : null}
      {meter && change ? (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <AmountField
              label={t("payments.reading.old_meter_final")}
              value={change.oldMeterFinal}
              onChange={(oldMeterFinal) => form.editMeterChange({ oldMeterFinal })}
              disabled={locked}
              fullWidth
            />
            <AmountField
              label={t("payments.reading.new_meter_start")}
              value={change.newMeterStart}
              onChange={(newMeterStart) => form.editMeterChange({ newMeterStart })}
              disabled={locked}
              fullWidth
            />
          </Stack>
          <TextField
            label={t("payments.reading.new_meter_number")}
            value={change.newMeterNumber}
            onChange={(event) => form.editMeterChange({ newMeterNumber: event.target.value })}
            disabled={locked}
            fullWidth
          />
        </Stack>
      ) : null}
      {text.units || text.bill || text.note || text.warnings.length > 0 ? (
        <Stack spacing={1}>
          <InfoRows
            rows={[
              { label: t("payments.reading.units"), value: text.units },
              { label: t("payments.reading.bill"), value: text.bill },
            ]}
          />
          {text.note ? (
            <Typography variant="body2" color="text.secondary">
              {text.note}
            </Typography>
          ) : null}
          {text.warnings.map((warning) => (
            <Typography key={warning} variant="body2" color="warning.dark">
              {warning}
            </Typography>
          ))}
        </Stack>
      ) : null}
      {form.saved && !locked ? (
        <Box>
          <Button color="error" startIcon={<DeleteOutlined />} onClick={() => void remove()}>
            {t("payments.reading.remove")}
          </Button>
        </Box>
      ) : null}
    </FormDialog>
  );
}
