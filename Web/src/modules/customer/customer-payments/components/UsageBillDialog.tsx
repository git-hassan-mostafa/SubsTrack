import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import type { CustomerPlan, MonthEntry, OpenItem } from "@shared/core/types";
import { useUsageBillEdit } from "@shared/modules/customer/customer-payments/hooks/useUsageBillEdit";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { AmountField } from "@/shared/components/AmountField";
import { FormDialog } from "@/shared/components/FormDialog";
import { InfoRows } from "@/shared/components/InfoRows";

interface UsageBillDialogProps {
  line: CustomerPlan;
  entry: MonthEntry;
  item: OpenItem;
  onClose: () => void;
}

export function UsageBillDialog({ line, entry, item, onClose }: UsageBillDialogProps) {
  const { t } = useTranslation();
  const form = useUsageBillEdit(line, entry, item);

  const close = () => {
    form.clearError();
    onClose();
  };

  const submit = async () => {
    if (await form.save()) onClose();
  };

  return (
    <FormDialog
      open
      title={form.title}
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
      <InfoRows
        rows={[
          { label: t("payments.reading.units"), value: form.units },
          { label: t("ledger.usage_worked_out"), value: form.workedOut },
        ]}
      />
      <AmountField
        label={form.amountLabel}
        value={form.amount}
        onChange={form.setAmount}
        onFocus={form.clearError}
        autoFocus
        fullWidth
      />
      <Typography variant="body2" color="text.secondary">
        {t("payments.usage_bill.hint")}
      </Typography>
      {form.canResetToWorkedOut ? (
        <Box>
          <Button onClick={form.resetToWorkedOut}>{t("payments.usage_bill.use_worked_out")}</Button>
        </Box>
      ) : null}
    </FormDialog>
  );
}
