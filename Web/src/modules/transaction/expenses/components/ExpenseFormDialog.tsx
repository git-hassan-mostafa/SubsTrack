import { useTranslation } from "react-i18next";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useExpenseForm } from "@shared/modules/transaction/expenses/hooks/useExpenseForm";
import { EXPENSE_CATEGORIES } from "@shared/modules/transaction/expenses/utils/expenseCategories";
import { BranchPicker } from "@/shared/components/BranchPicker";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { DateField } from "@/shared/components/DateField";
import { FormDialog } from "@/shared/components/FormDialog";

interface ExpenseFormDialogProps {
  onClose: () => void;
}

// Add only: a wrong expense is removed and typed again, never edited.
export function ExpenseFormDialog({ onClose }: ExpenseFormDialogProps) {
  const { t } = useTranslation();
  const form = useExpenseForm({ onSaved: onClose });

  return (
    <FormDialog
      open
      title={t("expenses.add_title")}
      onClose={onClose}
      onSubmit={form.save}
      dirty={form.dirty}
      error={form.error}
      onDismissError={form.clearError}
      submitLabel={t("expenses.add_title")}
      submitDisabled={!form.canSave}
    >
      <Autocomplete
        options={EXPENSE_CATEGORIES}
        value={EXPENSE_CATEGORIES.find((category) => category.code === form.category) ?? EXPENSE_CATEGORIES[0]}
        onChange={(_event, next) => form.setCategory(next.code)}
        getOptionLabel={(category) => t(category.labelKey)}
        getOptionKey={(category) => category.code}
        isOptionEqualToValue={(a, b) => a.code === b.code}
        noOptionsText={t("common.no_results")}
        disableClearable
        fullWidth
        renderInput={(params) => (
          <TextField {...params} label={t("expenses.category_label")} required />
        )}
      />

      <CurrencyInput
        label={t("expenses.amount_label")}
        amount={form.amount}
        currencyId={form.currencyId}
        onChange={form.setMoney}
        currencies={form.currencies}
        placeholder="0.00"
        required
      />

      <DateField
        label={t("expenses.date_label")}
        value={form.day}
        onChange={form.setDay}
        maxDate={form.today}
        required
      />

      <BranchPicker
        value={form.branchId}
        onChange={form.setBranchId}
        nullLabel={t("expenses.company_wide")}
      />

      <TextField
        label={t("expenses.description_label")}
        value={form.description}
        onChange={(event) => form.setDescription(event.target.value)}
        placeholder={t("expenses.description_placeholder")}
        multiline
        minRows={2}
        fullWidth
      />
    </FormDialog>
  );
}
