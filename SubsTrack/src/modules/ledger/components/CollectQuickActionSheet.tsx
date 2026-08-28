import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CustomerPicker } from "@/src/modules/customer/customers";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@/src/core/types";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useCollectSheet } from "../hooks/useCollectSheet";

interface Props {
  onDismiss: () => void;
}

/**
 * "Collect money" from anywhere in the app: pick a customer, and everything
 * they owe — debts AND plain unpaid months — is poured over oldest-first.
 *
 * This is the door for the case the whole rewrite is about: a customer walks in
 * and hands over cash without saying what it is for. Picking the customer is
 * the only question; the waterfall answers the rest, and the split preview
 * shows it before anything is written.
 */
export function CollectQuickActionSheet({ onDismiss }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const owed = useLedgerSlice((s) => s.owed);
  const loading = useLedgerSlice((s) => s.loadingOwed);
  const error = useLedgerSlice((s) => s.error);
  const fetchOwed = useLedgerSlice((s) => s.fetchOwed);
  const clearOwed = useLedgerSlice((s) => s.clearOwed);
  const clearError = useLedgerSlice((s) => s.clearError);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const { open: openCollect, sheet } = useCollectSheet({ onCollected: onDismiss });

  useEffect(() => {
    if (!customer) {
      clearOwed();
      return;
    }
    void fetchOwed(customer, customer.customerPlans ?? [], currencies);
  }, [customer, currencies, fetchOwed, clearOwed]);

  // The pool is ready → hand straight over to the collect sheet. There is no
  // second step to confirm: the sheet IS the confirmation, split and all.
  // `openCollect` is the stable callback, NOT the hook's object — see its doc.
  useEffect(() => {
    if (customer && !loading && owed.length > 0) {
      openCollect(customer.id, customer.name, owed);
    }
  }, [customer, loading, owed, openCollect]);

  const nothingOwed = customer && !loading && owed.length === 0;

  return (
    <>
      <FormSheet visible onDismiss={onDismiss} title={t("ledger.collect_money")}>
        <View className="gap-4 px-4 pb-8">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

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
