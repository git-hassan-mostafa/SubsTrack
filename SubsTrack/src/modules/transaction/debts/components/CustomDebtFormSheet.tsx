import { useState } from "react";
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
import type { OpenItem } from "@shared/core/types";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { useCustomDebtForm } from "@shared/modules/transaction/debts/hooks/useCustomDebtForm";
import type { CustomDebtCustomer } from "@shared/modules/transaction/debts/utils/customDebtForm";

interface Props {
  initialCustomer?: CustomDebtCustomer | null;
  item?: OpenItem | null;
  onDismiss: () => void;
}

// No "created" callback: raising a bill bumps `ledger.owedVersion` (#117).
export function CustomDebtFormSheet({
  initialCustomer,
  item,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const form = useCustomDebtForm({ item, initialCustomer, onSaved: onDismiss });
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  return (
    <>
      <FormSheet
        onDismiss={onDismiss}
        dirty={form.dirty}
        title={
          form.editing ? t("debts.edit_custom_debt") : t("debts.add_custom_debt")
        }
      >
        {form.error ? (
          <ErrorBanner message={form.error} onDismiss={form.clearError} />
        ) : null}

        {form.customerLocked ? (
          <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
            <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t("debts.customer_label")}
            </Text>
            <Text fontWeight="Medium" className="text-base text-gray-900">
              {form.customer?.name}
            </Text>
          </View>
        ) : (
          <CustomerPicker
            label={t("debts.customer_label") + " *"}
            placeholder={t("debts.pick_customer")}
            value={form.picked}
            onChange={form.setPicked}
            onAddNew={() => setAddCustomerOpen(true)}
          />
        )}

        <CurrencyInput
          label={t("debts.amount_label") + " *"}
          amount={form.amount}
          currencyId={form.currencyId}
          onChange={form.setMoney}
          currencies={form.currencies}
          placeholder="0.00"
          lockCurrency={form.currencyLocked}
          error={
            form.belowCollected
              ? t("debts.amount_floor_hint", { amount: form.collectedLabel })
              : null
          }
          onFocus={form.clearError}
        />

        {form.currencyLocked && !form.belowCollected ? (
          <Text className="-mt-2 mb-4 text-xs text-gray-500">
            {t("debts.currency_locked_hint", { amount: form.collectedLabel })}
          </Text>
        ) : null}

        <Input
          label={t("debts.description_label")}
          value={form.description}
          onChangeText={form.setDescription}
          placeholder={t("debts.description_placeholder")}
          multiline
        />

        <DatePickerInput
          label={t("ledger.due_date")}
          value={form.dueDate}
          onChange={form.setDueDate}
        />

        <Button
          label={
            form.editing ? t("debts.save_changes") : t("debts.add_custom_debt")
          }
          onPress={() => void form.save()}
          loading={form.saving}
          disabled={!form.canSave || form.saving}
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
