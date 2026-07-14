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
import { CustomerPicker, CustomerFormSheet } from "@/src/modules/customers";
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import debtService from "../services/DebtService";

interface Props {
  initialCustomer?: Customer | null;
  onDismiss: () => void;
  onCreated?: () => void;
}

export function DebtPaymentFormSheet({ initialCustomer, onDismiss, onCreated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const addDebtPayment = useDebtSlice((s) => s.addDebtPayment);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const clearError = useDebtSlice((s) => s.clearError);

  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  // The selected customer's outstanding debt in USD (null = not loaded yet). A
  // debt payment can never exceed this; the service enforces it too.
  const [owedUsd, setOwedUsd] = useState<number | null>(null);
  const [owedLoading, setOwedLoading] = useState(false);

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the picked customer's current net debt so we can guide the amount and
  // block payments when nothing is owed. Not branch-scoped — matches the panel.
  useEffect(() => {
    if (!customer) {
      setOwedUsd(null);
      return;
    }
    let cancelled = false;
    setOwedLoading(true);
    debtService
      .getNetUsd(null, customer.id)
      .then((usd) => {
        if (!cancelled) setOwedUsd(usd);
      })
      .catch(() => {
        if (!cancelled) setOwedUsd(null);
      })
      .finally(() => {
        if (!cancelled) setOwedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const target = findCurrency(currencies, displayCurrencyId);
  const noDebt = owedUsd !== null && owedUsd <= 0.005;
  // The typed amount converted to USD, to compare against what's owed.
  const enteredCurrency = findCurrency(currencies, currencyId);
  const amountUsd =
    amount != null ? amount / (enteredCurrency?.ratePerUsd ?? 1) : 0;
  const exceedsDebt =
    owedUsd !== null && owedUsd > 0.005 && amountUsd > owedUsd + 0.005;

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

  const submitDisabled =
    !customer ||
    amount == null ||
    amount <= 0 ||
    loading ||
    owedLoading ||
    noDebt ||
    exceedsDebt;

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
                onAddNew={() => setAddCustomerOpen(true)}
              />
            )}

            {/* Outstanding-debt hint / no-debt notice for the picked customer. */}
            {customer && !owedLoading ? (
              noDebt ? (
                <View className="mb-4 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
                  <Text className="text-sm text-amber-700">
                    {t("debts.no_debt_notice")}
                  </Text>
                </View>
              ) : owedUsd !== null ? (
                <View className="mb-4 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500 uppercase tracking-wide">
                    {t("debts.owes_label")}
                  </Text>
                  <Text className="text-sm font-semibold text-gray-900">
                    {formatMoney(owedUsd, null, target)}
                  </Text>
                </View>
              ) : null
            ) : null}

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

            {exceedsDebt ? (
              <View className="-mt-2 mb-4">
                <Text className="text-xs text-red-500">
                  {t("errors.debt_payment_exceeds_debt")}
                </Text>
              </View>
            ) : null}

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

      {addCustomerOpen && (
        <CustomerFormSheet onDismiss={() => setAddCustomerOpen(false)} />
      )}
    </Modal>
  );
}
