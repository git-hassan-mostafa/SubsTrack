import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import type { Currency, Plan } from "@shared/core/types";
import { linePeriodLabel } from "@shared/modules/admin/plans/utils/planLabels";

interface Props {
  plan: Plan | null;
  customPrice: number | null;
  customCurrencyId: string | null;
  onPriceChange: (amount: number | null, currencyId: string | null) => void;
  currencies: Currency[];
  disabled?: boolean;
}

// Collapsed to the plan price; the typed figure covers the plan's whole span.
export function PlanLinePriceField({
  plan,
  customPrice,
  customCurrencyId,
  onPriceChange,
  currencies,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);

  const planCurrency = plan ? findCurrency(currencies, plan.currencyId) : null;
  const planPrice =
    plan && !plan.isCustomPrice && plan.price !== null ? plan.price : null;
  const period = linePeriodLabel(plan?.durationMonths ?? 1, t);
  const special = customPrice !== null || opened;

  if (!special) {
    return (
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-gray-500" numberOfLines={1}>
          {planPrice !== null
            ? t("subscriptions.price_is_per", {
                price: formatMoney(planPrice, planCurrency, planCurrency),
                period,
              })
            : t("subscriptions.price_typed_each_month")}
        </Text>
        <PressableOpacity
          onPress={disabled ? undefined : () => setOpened(true)}
          disabled={disabled}
          hitSlop={8}
          className="ps-3"
        >
          <Text fontWeight="SemiBold" className="text-sm text-primary">
            {t("subscriptions.set_special_price")}
          </Text>
        </PressableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text
          fontWeight="SemiBold"
          className="text-xs text-gray-500 uppercase tracking-wide"
        >
          {t("subscriptions.price_special_per", { period })}
        </Text>
        <PressableOpacity
          onPress={
            disabled
              ? undefined
              : () => {
                  setOpened(false);
                  onPriceChange(null, null);
                }
          }
          disabled={disabled}
          hitSlop={8}
          className="ps-3"
        >
          <Text className="text-xs text-gray-500">
            {planPrice !== null
              ? t("subscriptions.use_plan_price")
              : t("common.clear")}
          </Text>
        </PressableOpacity>
      </View>
      <View className="-mb-4">
        <CurrencyInput
          amount={customPrice}
          currencyId={customCurrencyId}
          onChange={({ amount, currencyId }) =>
            onPriceChange(amount, currencyId)
          }
          currencies={currencies}
          placeholder={t("payments.enter_amount")}
          editable={!disabled}
        />
      </View>
    </View>
  );
}
