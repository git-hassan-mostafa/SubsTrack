import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { Text } from "@/src/shared/components/Text";
import type { Currency } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { usageMonthPriceLabel } from "@shared/modules/admin/plans/utils/planLabels";
import {
  usagePriceDraftState,
  type UsagePriceDraft,
  type UsagePriceEdit,
} from "@shared/modules/admin/plans/utils/usageMonthPrices";

interface Props {
  draft: UsagePriceDraft;
  currencies: Currency[];
  onChange: (patch: UsagePriceEdit) => void;
  onFocus: () => void;
}

export function UsagePriceCard({ draft, currencies, onChange, onFocus }: Props) {
  const { t } = useTranslation();
  const { plan, saved, last } = draft;
  const usage = plan.usage;
  if (!usage) return null;
  const invalid = usagePriceDraftState(draft) === "invalid";

  return (
    <View className="border border-gray-200 rounded-2xl p-4 mb-4 bg-white">
      <Text fontWeight="SemiBold" className="text-base text-gray-900 mb-3">
        {plan.name}
      </Text>

      <CurrencyInput
        label={usage.feeName}
        amount={draft.fixedFee}
        currencyId={plan.currencyId}
        onChange={({ amount }) => onChange({ fixedFee: amount })}
        currencies={currencies}
        lockCurrency
        onFocus={onFocus}
      />

      <CurrencyInput
        label={t("plans.unit_price_label", { unit: usage.unitName })}
        amount={draft.unitPrice}
        currencyId={plan.currencyId}
        onChange={({ amount }) => onChange({ unitPrice: amount })}
        currencies={currencies}
        lockCurrency
        onFocus={onFocus}
      />

      {invalid ? (
        <Text className="text-sm text-danger -mt-2">{t("plans.month_prices_invalid")}</Text>
      ) : saved ? null : (
        <Text className="text-xs text-gray-400 -mt-2">{t("plans.month_prices_none")}</Text>
      )}
      {!saved && last ? (
        <Text className="text-xs text-gray-400 mt-1">
          {t("plans.month_prices_last", {
            month: billingMonthLabel(last.month, true),
            price: usageMonthPriceLabel(last.price, usage, currencies, t),
          })}
        </Text>
      ) : null}
    </View>
  );
}
