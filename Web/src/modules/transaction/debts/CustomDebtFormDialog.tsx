import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import type { Charge, OpenItem } from "@shared/core/types";
import { useCustomDebtForm } from "@shared/modules/transaction/debts/hooks/useCustomDebtForm";
import type { CustomDebtCustomer } from "@shared/modules/transaction/debts/utils/customDebtForm";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { DateField } from "@/shared/components/DateField";
import { FormDialog } from "@/shared/components/FormDialog";
import { CustomerFormDialog } from "@/modules/customer/customers/CustomerFormDialog";
import { CustomerPicker } from "@/modules/customer/customers/CustomerPicker";

interface CustomDebtFormDialogProps {
  item?: OpenItem | null;
  initialCustomer?: CustomDebtCustomer | null;
  onClose: () => void;
  onSaved?: (charge: Charge) => void;
}

// A hand-typed bill; once it took money its currency and rate stay frozen.
export function CustomDebtFormDialog({ item = null, initialCustomer = null, onClose, onSaved }: CustomDebtFormDialogProps) {
  const { t } = useTranslation();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const form = useCustomDebtForm({
    item,
    initialCustomer,
    onSaved: (charge) => {
      onSaved?.(charge);
      onClose();
    },
  });
  const newCustomerLabel = t("web.sales.new_customer");
  const lockedHint = form.currencyLocked && !form.belowCollected
    ? t("debts.currency_locked_hint", { amount: form.collectedLabel })
    : undefined;

  return (
    <FormDialog
      open
      title={form.editing ? t("debts.edit_custom_debt") : t("debts.add_custom_debt")}
      onClose={onClose}
      onSubmit={form.save}
      dirty={form.dirty}
      error={form.error}
      onDismissError={form.clearError}
      submitLabel={form.editing ? t("debts.save_changes") : t("debts.add_custom_debt")}
      submitDisabled={!form.canSave}
    >
      {form.customerLocked ? (
        <TextField
          label={t("debts.customer_label")}
          value={form.customer?.name ?? ""}
          slotProps={{ input: { readOnly: true } }}
          fullWidth
        />
      ) : (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <CustomerPicker
              label={t("debts.customer_label")}
              value={form.picked}
              onChange={form.setPicked}
              placeholder={t("debts.pick_customer")}
              required
            />
          </Box>
          <Tooltip title={newCustomerLabel}>
            <IconButton aria-label={newCustomerLabel} onClick={() => setAddCustomerOpen(true)} sx={{ mt: 1 }}>
              <PersonAddOutlined />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      <CurrencyInput
        label={t("debts.amount_label")}
        amount={form.amount}
        currencyId={form.currencyId}
        onChange={form.setMoney}
        currencies={form.currencies}
        placeholder="0.00"
        lockCurrency={form.currencyLocked}
        error={form.belowCollected ? t("debts.amount_floor_hint", { amount: form.collectedLabel }) : null}
        helperText={lockedHint}
        required
      />

      <TextField
        label={t("debts.description_label")}
        value={form.description}
        onChange={(event) => form.setDescription(event.target.value)}
        placeholder={t("debts.description_placeholder")}
        multiline
        minRows={2}
        fullWidth
      />

      <DateField label={t("ledger.due_date")} value={form.dueDate} onChange={form.setDueDate} required />

      {addCustomerOpen ? (
        <CustomerFormDialog
          customer={null}
          onClose={() => setAddCustomerOpen(false)}
          onSaved={(saved) => {
            form.setPicked(saved);
            setAddCustomerOpen(false);
          }}
        />
      ) : null}
    </FormDialog>
  );
}
