import { useEffect, useState } from "react";
import { View } from "react-native";
import { SheetModal } from "@/src/shared/components/SheetModal";
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
import {
  CustomerPicker,
  CustomerFormSheet,
} from "@/src/modules/customer/customers";
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDebtSlice } from "@/src/state/hooks/useDebtSlice";
import { findCurrency } from "@/src/core/utils/currency";

// When locked to a specific customer, the form only needs their id + name (no
// picker is rendered), so callers may pass a lightweight customer ref — e.g. the
// debtor detail sheet, which has only the debtor's id/name, not a full Customer.
type CustomerRef = Pick<Customer, "id" | "name">;

interface Props {
  initialCustomer?: CustomerRef | null;
  onDismiss: () => void;
  onCreated?: () => void;
}

export function CustomDebtFormSheet({
  initialCustomer,
  onDismiss,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const addCustomDebt = useDebtSlice((s) => s.addCustomDebt);
  const loading = useDebtSlice((s) => s.loading);
  const error = useDebtSlice((s) => s.error);
  const clearError = useDebtSlice((s) => s.clearError);

  // When `initialCustomer` is passed the customer is locked (no picker). The
  // picker path builds up a full Customer here; the effective target is either.
  const [picked, setPicked] = useState<Customer | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);

  const customer: CustomerRef | null = initialCustomer ?? picked;

  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (!user || !customer || amount == null || amount <= 0) return;
    const ok = await addCustomDebt({
      customerId: customer.id,
      amount,
      description: description.trim() || null,
      currency: findCurrency(currencies, currencyId),
      recordedByUserId: user.id,
      tenantId: user.tenantId,
    });
    if (ok) {
      onCreated?.();
      onDismiss();
    }
  }

  const submitDisabled = !customer || amount == null || amount <= 0 || loading;

  return (
    <SheetModal onDismiss={onDismiss}>
      <SafeAreaView className="flex-1 bg-white">
        <ResponsiveContainer className="flex-1">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-gray-900">
              {t("debts.add_custom_debt")}
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
            {error ? (
              <ErrorBanner message={error} onDismiss={clearError} />
            ) : null}

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
              onFocus={clearError}
            />

            <Input
              label={t("debts.description_label")}
              value={description}
              onChangeText={setDescription}
              placeholder={t("debts.description_placeholder")}
              multiline
            />

            <Button
              label={t("debts.add_custom_debt")}
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
    </SheetModal>
  );
}
