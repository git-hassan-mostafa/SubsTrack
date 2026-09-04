import { useEffect, useState } from "react";
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
import type { ExpenseCategory } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useExpenseStore } from "@/src/modules/transaction/expenses/state/expenseStore";
import { findCurrency } from "@/src/core/utils/currency";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import { EXPENSE_CATEGORIES } from "../utils/expenseCategories";

interface Props {
  onDismiss: () => void;
  onCreated?: () => void;
}

// Today as YYYY-MM-DD in local time (DatePickerInput's format).
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A picked day → the ISO instant stored in incurred_at. Midday keeps the row in
// the intended calendar day whichever way the device's UTC offset leans.
function dayToIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function ExpenseFormSheet({ onDismiss, onCreated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addExpense = useExpenseStore((s) => s.addExpense);
  const loading = useExpenseStore((s) => s.loading);
  const error = useExpenseStore((s) => s.error);
  const clearError = useExpenseStore((s) => s.clearError);

  const [category, setCategory] = useState<ExpenseCategory>("rent");
  const [amount, setAmount] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(today());
  const [branchId, setBranchId] = useState<string | null>(user?.branchId ?? null);

  const dirty = useDirtyForm({ category, amount, description, day, branchId });

  useEffect(() => {
    clearError();
  }, [clearError]);

  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({
    label: t(c.labelKey),
    value: c.code,
  }));

  async function handleSubmit() {
    if (!user || amount == null || amount <= 0) return;
    const ok = await addExpense({
      category,
      amount,
      description: description.trim() || null,
      currency: findCurrency(currencies, currencyId),
      branchId,
      incurredAt: dayToIso(day),
      recordedByUserId: user.id,
      tenantId: user.tenantId,
    });
    if (ok) {
      onCreated?.();
      onDismiss();
    }
  }

  const submitDisabled = amount == null || amount <= 0 || loading;

  return (
    <FormSheet onDismiss={onDismiss} dirty={dirty} title={t("expenses.add_title")}>
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

      <Dropdown<ExpenseCategory>
        label={t("expenses.category_label") + " *"}
        options={categoryOptions}
        value={category}
        onChange={(v) => setCategory(v ?? "other")}
      />

      <CurrencyInput
        label={t("expenses.amount_label") + " *"}
        amount={amount}
        currencyId={currencyId}
        onChange={({ amount: a, currencyId: c }) => {
          setAmount(a);
          setCurrencyId(c);
        }}
        currencies={currencies}
        placeholder="0.00"
        onFocus={clearError}
      />

      {/* The day the money went out — not "today". Last month's rent entered
          now still belongs to last month. */}
      <DatePickerInput
        label={t("expenses.date_label") + " *"}
        value={day}
        onChange={setDay}
        maxDate={today()}
      />

      <BranchPicker
        label={t("branches.branch_label")}
        value={branchId}
        onChange={setBranchId}
        nullable={user?.branchId === null}
        nullLabel={t("expenses.company_wide")}
      />

      <Input
        label={t("expenses.description_label")}
        value={description}
        onChangeText={setDescription}
        placeholder={t("expenses.description_placeholder")}
        multiline
      />

      <Button
        label={t("expenses.add_title")}
        onPress={handleSubmit}
        loading={loading}
        disabled={submitDisabled}
        fullWidth
      />
      <View className="h-24" />
    </FormSheet>
  );
}
