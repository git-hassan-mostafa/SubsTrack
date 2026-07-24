import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { COLORS } from "@/src/shared/constants";

interface Props {
  paymentMode: "full" | "partial" | "debt";
  onPaymentModeChange: (mode: "full" | "partial" | "debt") => void;
  amountPaid: number | null;
  onAmountPaidChange: (amount: number | null) => void;
  // Currency the Amount Paid input is locked to (same unit as Amount Due).
  currencyId: string | null;
  // Used for the inline "balance remaining / cleared" hint. null disables it
  // (e.g. when Amount Due is not yet entered).
  amountDue: number | null;
  formatAmount: (amount: number) => string;
  onFocusClearError?: () => void;
  // True when an Amount Due is not yet known (custom-amount path with no
  // value typed). Partial cannot be chosen without a due to validate against.
  partialDisabled?: boolean;
}

export function PaymentAmountPaidSection({
  paymentMode,
  onPaymentModeChange,
  amountPaid,
  onAmountPaidChange,
  currencyId,
  amountDue,
  formatAmount,
  onFocusClearError,
  partialDisabled = false,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);

  return (
    <View className="mb-4">
      <View className="flex-row gap-6">
        {(["full", "partial", "debt"] as const).map((mode) => {
          const isSelected = paymentMode === mode;
          const isDisabled = mode === "partial" && partialDisabled;
          return (
            <PressableOpacity
              key={mode}
              onPress={() => {
                if (isDisabled) return;
                onPaymentModeChange(mode);
              }}
              disabled={isDisabled}
              className={`flex-row items-center gap-2 ${isDisabled ? "opacity-40" : ""}`}
            >
              <View
                className={`w-4 h-4 rounded-full border-2 items-center justify-center ${isSelected ? "border-primary" : "border-gray-400"}`}
              >
                {isSelected ? (
                  <View className="w-2 h-2 rounded-full bg-primary" />
                ) : null}
              </View>
              <Text className="text-sm text-gray-700">
                {mode === "full"
                  ? t("payments.full_payment")
                  : mode === "partial"
                    ? t("payments.partial_payment")
                    : t("payments.debt_payment")}
              </Text>
            </PressableOpacity>
          );
        })}
      </View>
      {partialDisabled ? (
        <Text className="text-xs text-gray-400 mt-1">
          {t("payments.enter_amount_to_enable_partial")}
        </Text>
      ) : null}

      {paymentMode === "partial" ? (
        <View className="w-full mt-3">
          <CurrencyInput
            label={t("payments.amount_paid_label")}
            amount={amountPaid}
            currencyId={currencyId}
            onChange={({ amount }) => onAmountPaidChange(amount)}
            currencies={currencies}
            placeholder={t("payments.enter_amount")}
            lockCurrency
            onFocus={onFocusClearError}
          />
          {amountDue != null && amountPaid != null
            ? (() => {
                const balance = amountDue - amountPaid;
                if (balance <= 0) {
                  return (
                    <Text className="text-sm font-semibold mt-1 text-green-600">
                      {t("payments.balance_cleared")}
                    </Text>
                  );
                }
                // Partial: the month still counts as paid; the remaining amount
                // becomes a debt shown on the Debts page.
                return (
                  <View className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex-row items-start gap-2">
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={COLORS.warning}
                      style={{ marginTop: 1 }}
                    />
                    <Text className="flex-1 text-xs text-amber-700 leading-5">
                      {t("payments.partial_debt_notice", {
                        amount: formatAmount(balance),
                      })}
                    </Text>
                  </View>
                );
              })()
            : null}
        </View>
      ) : null}
    </View>
  );
}
