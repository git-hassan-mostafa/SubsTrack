import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@shared/core/types";
import { useCustomerOwed } from "@shared/modules/ledger/hooks/useCustomerOwed";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { useCollectSheet } from "../hooks/useCollectSheet";

interface Props {
  onDismiss: () => void;
}

// Pick a customer; everything they owe is poured over oldest-first by the waterfall.
export function CollectQuickActionSheet({ onDismiss }: Props) {
  const { t } = useTranslation();
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const { loading, owed, nothingOwed } = useCustomerOwed(customer);
  const { open: openCollect, sheet } = useCollectSheet({
    onCollected: onDismiss,
  });
  const showError = error != null && sheet == null;

  useEffect(() => {
    if (customer && owed.length > 0) {
      openCollect(customer.id, customer.name, owed);
    }
  }, [customer, owed, openCollect]);

  return (
    <>
      <FormSheet
        visible
        onDismiss={onDismiss}
        title={t("ledger.collect_money")}
      >
        <View className="gap-4 pb-8">
          {showError ? (
            <ErrorBanner message={error} onDismiss={clearError} />
          ) : null}

          <CustomerPicker
            label={t("debts.customer_label") + " *"}
            placeholder={t("debts.pick_customer")}
            value={customer}
            onChange={setCustomer}
          />

          {loading ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : nothingOwed ? (
            <Text className="py-6 text-center text-sm text-gray-400">
              {t("ledger.nothing_owed")}
            </Text>
          ) : null}
        </View>
      </FormSheet>

      {sheet}
    </>
  );
}
