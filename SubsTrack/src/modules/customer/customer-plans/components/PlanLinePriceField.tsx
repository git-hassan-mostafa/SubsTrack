import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import type { Currency, Plan } from "@/src/core/types";

interface Props {
  plan: Plan | null;
  customPrice: number | null;
  customCurrencyId: string | null;
  onPriceChange: (amount: number | null, currencyId: string | null) => void;
  currencies: Currency[];
  disabled?: boolean;
}

/**
 * The price of one service line in the customer form's Plans editor.
 *
 * Collapsed by default to a single line — the plan's price plus a "Change" link —
 * because the overwhelming case is "just charge the plan price" and the editor
 * shows one of these per line. Tapping Change opens the amount field inline; the
 * field is the whole control, so there is no tab that hides its own input.
 *
 * The amount is the price of ONE payment, so on a multi-month plan it covers the
 * whole bundle ("100 per 3 months"). Every label names that span.
 * See `linePrice.ts` for the read side.
 */
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
  const durationMonths = plan?.durationMonths ?? 1;
  const period =
    durationMonths > 1
      ? t("subscriptions.per_n_months", { count: durationMonths })
      : t("subscriptions.per_month");
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
        {/* The period rides in the label: this is where the figure is typed, so
            "per 3 months" must be unmissable to avoid a 3x under-charge. */}
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
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
      {/* CurrencyInput carries its own mb-4 for stacked forms; pulled back so the
          card's own bottom padding is the only gap under the last field. */}
      <View className="-mb-4">
        <CurrencyInput
          amount={customPrice}
          currencyId={customCurrencyId}
          onChange={({ amount, currencyId }) => onPriceChange(amount, currencyId)}
          currencies={currencies}
          placeholder={t("payments.enter_amount")}
          editable={!disabled}
        />
      </View>
    </View>
  );
}
