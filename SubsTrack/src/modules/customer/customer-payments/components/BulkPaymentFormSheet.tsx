import { useState } from "react";
import { View } from "react-native";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/shared/components/Button";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { PaymentAmountPaidSection } from "./PaymentAmountPaidSection";

export interface BulkPaymentValues {
  amountDue: number;
  amountPaid: number;
  currencyId: string | null;
}

interface Props {
  count: number;
  submitting: boolean;
  onConfirm: (values: BulkPaymentValues) => void;
  onDismiss: () => void;
}

// Bulk amount popup for custom-price / no-plan customers: one amount due +
// full/partial choice is applied to every selected payable month. Mirrors the
// custom-amount path of PaymentFormSheet.
export function BulkPaymentFormSheet({
  count,
  submitting,
  onConfirm,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);

  const [amountDue, setAmountDue] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "debt">(
    "full",
  );
  const [amountPaid, setAmountPaid] = useState<number | null>(null);

  const resolvedPaid =
    paymentMode === "full"
      ? amountDue
      : paymentMode === "debt"
        ? 0
        : amountPaid;
  const currency = findCurrency(currencies, currencyId);
  const formatResolved = (amount: number) =>
    formatMoney(amount, currency, currency);

  const canSubmit =
    amountDue !== null &&
    amountDue > 0 &&
    resolvedPaid !== null &&
    resolvedPaid >= 0 &&
    resolvedPaid <= amountDue &&
    !submitting;

  function handleSubmit() {
    if (!canSubmit || amountDue === null || resolvedPaid === null) return;
    onConfirm({ amountDue, amountPaid: resolvedPaid, currencyId });
  }

  function handleDismiss() {
    clearError();
    onDismiss();
  }

  return (
    <FormSheet onDismiss={handleDismiss} title={t("payments.record_payment")}>
            {error ? (
              <ErrorBanner message={error} onDismiss={clearError} />
            ) : null}

            <View className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm text-primary">
                {t("payments.bulk_pay_apply_hint", { count })}
              </Text>
            </View>

            {/* Amount due — establishes the amount applied to each month. */}
            <View className="bg-gray-50 rounded-2xl px-6 py-5 items-center mb-5">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                {t("payments.amount_section")}
              </Text>
              <View className="w-full">
                <CurrencyInput
                  amount={amountDue}
                  currencyId={currencyId}
                  onChange={({ amount, currencyId: cId }) => {
                    const currencyChanged = cId !== currencyId;
                    const amountCleared = amount === null || amount <= 0;
                    setAmountDue(amount);
                    setCurrencyId(cId);
                    if (amountCleared) {
                      setPaymentMode("full");
                      setAmountPaid(null);
                    } else if (currencyChanged) {
                      setAmountPaid(null);
                    }
                  }}
                  currencies={currencies}
                  placeholder={t("payments.enter_amount")}
                  onFocus={clearError}
                />
              </View>
            </View>

            {/* Full / Partial / Debt selector. */}
            <PaymentAmountPaidSection
              paymentMode={paymentMode}
              onPaymentModeChange={(mode) => {
                setPaymentMode(mode);
                if (mode !== "partial") setAmountPaid(null);
              }}
              amountPaid={amountPaid}
              onAmountPaidChange={setAmountPaid}
              currencyId={currencyId}
              amountDue={amountDue}
              formatAmount={formatResolved}
              onFocusClearError={clearError}
              partialDisabled={amountDue == null || amountDue <= 0}
            />

            <Button
              label={
                amountDue !== null &&
                resolvedPaid !== null &&
                resolvedPaid < amountDue
                  ? t("payments.record_payment_action")
                  : t("payments.mark_as_paid")
              }
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              fullWidth
            />
        <View className="h-4" />
    </FormSheet>
  );
}
