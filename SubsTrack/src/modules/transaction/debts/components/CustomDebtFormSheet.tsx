import { useEffect, useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import {
  CustomerPicker,
  CustomerFormSheet,
} from "@/src/modules/customer/customers";
import type { Customer, OpenItem } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import {
  findCurrency,
  formatMoney,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { getTodayDateString } from "@/src/core/utils/date";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";

// When locked to a specific customer, the form only needs their id + name (no
// picker is rendered), so callers may pass a lightweight customer ref — e.g. the
// debtor detail sheet, which has only the debtor's id/name, not a full Customer.
type CustomerRef = Pick<Customer, "id" | "name"> & Partial<Pick<Customer, "branchId">>;

// A locked customer may arrive as a bare {id, name} (the debtor sheet has no
// full record), so the branch falls back to the recording user's.
function branchOf(customer: CustomerRef): string | null | undefined {
  return customer.branchId;
}

// No "created" callback on purpose: raising a bill bumps `ledger.owedVersion`,
// and every surface that shows owed money watches it (`useOwedChanged`).
interface Props {
  initialCustomer?: CustomerRef | null;
  item?: OpenItem | null;
  onDismiss: () => void;
}

export function CustomDebtFormSheet({
  initialCustomer,
  item,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addManualCharge = useLedgerSlice((s) => s.addManualCharge);
  const updateManualCharge = useLedgerSlice((s) => s.updateManualCharge);
  const loading = useLedgerSlice((s) => s.loading);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  const editing = item ?? null;
  const collected = editing?.paid ?? 0;
  const currencyLocked = collected > 0;

  const [picked, setPicked] = useState<Customer | null>(null);
  const [amount, setAmount] = useState<number | null>(editing?.amount ?? null);
  const [currencyId, setCurrencyId] = useState<string | null>(
    editing?.currencyId ?? null,
  );
  const [description, setDescription] = useState(
    editing?.charge?.description ?? "",
  );
  const [dueDate, setDueDate] = useState(
    () => editing?.dueDate ?? getTodayDateString(),
  );
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const dirty = useDirtyForm({
    pickedId: picked?.id ?? null,
    amount,
    currencyId,
    description,
    dueDate,
  });

  const lockedCustomer: CustomerRef | null = editing
    ? { id: editing.customerId, name: editing.customerName, branchId: editing.branchId }
    : (initialCustomer ?? null);
  const customer: CustomerRef | null = lockedCustomer ?? picked;

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function handleSubmit() {
    if (!user || !customer || amount == null || amount <= 0) return;
    const currency = findCurrency(currencies, currencyId);
    if (editing?.chargeId) {
      const saved = await updateManualCharge(editing.chargeId, {
        description: description.trim(),
        amount,
        currencyId: currency?.id ?? null,
        ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
        dueDate,
      });
      if (saved) onDismiss();
      return;
    }
    const created = await addManualCharge({
      tenantId: user.tenantId,
      customerId: customer.id,
      branchId: branchOf(customer) ?? user.branchId,
      description: description.trim() || null,
      amount,
      currencyId: currency?.id ?? null,
      ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
      dueDate,
      recordedByUserId: user.id,
    });
    if (created) onDismiss();
  }

  const belowCollected = amount != null && amount < collected;
  const submitDisabled =
    !customer || amount == null || amount <= 0 || belowCollected || loading;

  const billCurrency = editing ? snapshotCurrency(editing, currencies) : null;
  const collectedLabel = editing
    ? formatMoney(collected, billCurrency, billCurrency)
    : "";

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={dirty}
        title={editing ? t("debts.edit_custom_debt") : t("debts.add_custom_debt")}
      >
            {error ? (
              <ErrorBanner message={error} onDismiss={clearError} />
            ) : null}

            {lockedCustomer ? (
              <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  {t("debts.customer_label")}
                </Text>
                <Text fontWeight="Medium" className="text-base text-gray-900">
                  {customer?.name}
                </Text>
              </View>
            ) : (
              <CustomerPicker
                label={t("debts.customer_label") + " *"}
                placeholder={t("debts.pick_customer")}
                value={picked}
                onChange={setPicked}
                onAddNew={() => setAddCustomerOpen(true)}
              />
            )}

            <CurrencyInput
              label={t("debts.amount_label") + " *"}
              amount={amount}
              currencyId={currencyId}
              onChange={({ amount: a, currencyId: c }) => {
                setAmount(a);
                setCurrencyId(c);
              }}
              currencies={currencies}
              placeholder="0.00"
              lockCurrency={currencyLocked}
              error={
                belowCollected
                  ? t("debts.amount_floor_hint", { amount: collectedLabel })
                  : null
              }
              onFocus={clearError}
            />

            {currencyLocked && !belowCollected ? (
              <Text className="-mt-2 mb-4 text-xs text-gray-500">
                {t("debts.currency_locked_hint", { amount: collectedLabel })}
              </Text>
            ) : null}

            <Input
              label={t("debts.description_label")}
              value={description}
              onChangeText={setDescription}
              placeholder={t("debts.description_placeholder")}
              multiline
            />

            <DatePickerInput
              label={t("ledger.due_date")}
              value={dueDate}
              onChange={setDueDate}
            />

            <Button
              label={
                editing ? t("debts.save_changes") : t("debts.add_custom_debt")
              }
              onPress={handleSubmit}
              loading={loading}
              disabled={submitDisabled}
              fullWidth
            />
        <View className="h-24" />
      </FormSheet>

      {addCustomerOpen && (
        <CustomerFormSheet onDismiss={() => setAddCustomerOpen(false)} />
      )}
    </>
  );
}
