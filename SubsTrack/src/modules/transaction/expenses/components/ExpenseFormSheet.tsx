import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { Dropdown } from "@/src/shared/components/Dropdown";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { BranchPicker } from "@/src/shared/components/BranchPicker";
import type { ExpenseCategory } from "@shared/core/types";
import { useExpenseForm } from "@shared/modules/transaction/expenses/hooks/useExpenseForm";
import { EXPENSE_CATEGORIES } from "@shared/modules/transaction/expenses/utils/expenseCategories";

interface Props {
  onDismiss: () => void;
}

export function ExpenseFormSheet({ onDismiss }: Props) {
  const { t } = useTranslation();
  const form = useExpenseForm({ onSaved: onDismiss });

  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({
    label: t(c.labelKey),
    value: c.code,
  }));

  return (
    <FormSheet
      onDismiss={onDismiss}
      dirty={form.dirty}
      title={t("expenses.add_title")}
    >
      {form.error ? (
        <ErrorBanner message={form.error} onDismiss={form.clearError} />
      ) : null}

      <Dropdown<ExpenseCategory>
        label={t("expenses.category_label") + " *"}
        options={categoryOptions}
        value={form.category}
        onChange={(v) => form.setCategory(v ?? "other")}
        searchable
      />

      <CurrencyInput
        label={t("expenses.amount_label") + " *"}
        amount={form.amount}
        currencyId={form.currencyId}
        onChange={form.setMoney}
        currencies={form.currencies}
        placeholder="0.00"
        onFocus={form.clearError}
      />

      <DatePickerInput
        label={t("expenses.date_label") + " *"}
        value={form.day}
        onChange={form.setDay}
        maxDate={form.today}
      />

      <BranchPicker
        label={t("branches.branch_label")}
        value={form.branchId}
        onChange={form.setBranchId}
        nullLabel={t("expenses.company_wide")}
      />

      <Input
        label={t("expenses.description_label")}
        value={form.description}
        onChangeText={form.setDescription}
        placeholder={t("expenses.description_placeholder")}
        multiline
      />

      <Button
        label={t("expenses.add_title")}
        onPress={() => void form.save()}
        loading={form.saving}
        disabled={!form.canSave || form.saving}
        fullWidth
      />
      <View className="h-24" />
    </FormSheet>
  );
}
