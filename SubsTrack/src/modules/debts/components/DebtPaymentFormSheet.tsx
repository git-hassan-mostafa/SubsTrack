import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { CustomerPicker } from "@/src/modules/customers";
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import { findCurrency } from "@/src/core/utils/currency";

interface Props {
  initialCustomer?: Customer | null;
  onDismiss: () => void;
  onCreated?: () => void;
}

export function DebtPaymentFormSheet({ initialCustomer, onDismiss, onCreated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const clearError = useDebtSlice((s) => s.clearError);

  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user || !customer || amount == null || amount <= 0) return;
    const ok = await addDebtPayment({
      customerId: customer.id,
      amount,
      notes: notes.trim() || null,
      currency: findCurrency(currencies, currencyId),
      receivedByUserId: user.id,
      tenantId: user.tenantId,
    });
    if (ok) {
      onCreated?.();
      onDismiss();
    }
  }

  const submitDisabled = !customer || amount == null || amount <= 0 || loading;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-gray-900">
              {t("debts.record_debt_payment")}
            </Text>
            <PressableOpacity onPress={onDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.cancel")}
              </Text>
            </PressableOpacity>
          </View>

          <KeyboardAwareScrollView
            className="flex-1 px-6 pt-6"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 48 }}
            bottomOffset={24}
          >
            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

            {initialCustomer ? (
              <View className="mb-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                <Text className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  {t("debts.customer_label")}
                </Text>
                <Text className="text-base text-gray-900 font-medium">
                  {customer?.name}
                </Text>
              </View>
            ) : (
              <CustomerPicker
                label={t("debts.customer_label") + " *"}
                placeholder={t("debts.pick_customer")}
                value={customer}
                onChange={setCustomer}
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
              onFocus={clearError}
            />

            <Input
              label={t("debts.notes_label")}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("debts.notes_placeholder")}
              multiline
            />

            <Button
              label={t("debts.record_debt_payment")}
              onPress={handleSubmit}
              loading={loading}
              disabled={submitDisabled}
              fullWidth
            />
            <View className="h-24" />
          </KeyboardAwareScrollView>
        </ResponsiveContainer>
      </SafeAreaView>
    </Modal>
  );
}
