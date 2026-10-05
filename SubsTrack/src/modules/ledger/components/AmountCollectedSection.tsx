import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { COLORS } from "@/src/shared/constants";
import {
  amountCollectedView,
  type PaymentMode,
} from "@shared/modules/ledger/utils/amountCollected";

interface Props {
  paymentMode: PaymentMode;
  onPaymentModeChange: (mode: PaymentMode) => void;
  amountPaid: number | null;
  onAmountPaidChange: (amount: number | null) => void;
  currencyId: string | null;
  due: number;
  formatAmount: (amount: number) => string;
  onFocusClearError?: () => void;
}

// How much of a bill is handed over now; the rule is Shared `amountCollected`.
export function AmountCollectedSection({
  paymentMode,
  onPaymentModeChange,
  amountPaid,
  onAmountPaidChange,
  currencyId,
  due,
  formatAmount,
  onFocusClearError,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const view = amountCollectedView(paymentMode, due, amountPaid);
  const outcome = view.outcome;

  return (
    <View className="mb-4">
      <View className="flex-row gap-6">
        {view.options.map((option) => {
          const isSelected = paymentMode === option.mode;
          return (
            <PressableOpacity
              key={option.mode}
              onPress={() => onPaymentModeChange(option.mode)}
              disabled={option.disabled}
              className={`flex-row items-center gap-2 ${option.disabled ? "opacity-40" : ""}`}
            >
              <View
                className={`w-4 h-4 rounded-full border-2 items-center justify-center ${isSelected ? "border-primary" : "border-gray-400"}`}
              >
                {isSelected ? (
                  <View className="w-2 h-2 rounded-full bg-primary" />
                ) : null}
              </View>
              <Text className="text-sm text-gray-700">
                {t(option.labelKey)}
              </Text>
            </PressableOpacity>
          );
        })}
      </View>
      {view.partialLocked ? (
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
          {outcome?.kind === "exceeds" ? (
            <Text fontWeight="SemiBold" className="text-sm mt-1 text-danger">
              {t("errors.amount_paid_exceeds_due")}
            </Text>
          ) : outcome?.kind === "cleared" ? (
            <Text fontWeight="SemiBold" className="text-sm mt-1 text-green-600">
              {t("payments.balance_cleared")}
            </Text>
          ) : outcome?.kind === "owes" ? (
            <View className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex-row items-start gap-2">
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={COLORS.warning}
                style={{ marginTop: 1 }}
              />
              <Text className="flex-1 text-xs text-amber-700 leading-5">
                {t("payments.partial_debt_notice", {
                  amount: formatAmount(outcome.balance),
                })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
