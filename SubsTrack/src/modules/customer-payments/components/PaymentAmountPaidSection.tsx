import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";

interface Props {
  paymentMode: "full" | "partial";
  onPaymentModeChange: (mode: "full" | "partial") => void;
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
  const { currencies } = useCurrencyStore();

  return (
    <View className="bg-gray-50 rounded-2xl px-4 py-4 mb-4">
      <View className="w-full gap-2">
        {(["full", "partial"] as const).map((mode) => {
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
              className={`flex-row items-center border rounded-xl px-4 py-3 ${isSelected ? "border-primary bg-indigo-50" : "border-gray-200 bg-white"} ${isDisabled ? "opacity-50" : ""}`}
            >
              <View
                className={`w-4 h-4 rounded-full border-2 me-3 items-center justify-center ${isSelected ? "border-primary" : "border-gray-400"}`}
              >
                {isSelected ? (
                  <View className="w-2 h-2 rounded-full bg-primary" />
                ) : null}
              </View>
              <Text className="text-sm text-gray-700">
                {mode === "full"
                  ? t("payments.full_payment")
                  : t("payments.partial_payment")}
              </Text>
            </PressableOpacity>
          );
        })}
      </View>
      {partialDisabled ? (
        <Text className="text-xs text-gray-400 mt-2">
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
                return (
                  <Text
                    className={`text-sm font-semibold mt-1 ${balance > 0 ? "text-amber-600" : "text-green-600"}`}
                  >
                    {balance > 0
                      ? t("payments.balance_remaining", {
                          amount: formatAmount(balance),
                        })
                      : t("payments.balance_cleared")}
                  </Text>
                );
              })()
            : null}
        </View>
      ) : null}
    </View>
  );
}
