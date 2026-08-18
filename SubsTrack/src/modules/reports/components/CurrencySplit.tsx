import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { Currency } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";

interface Props {
  rows: { currencyId: string | null; amount: number; usd: number }[];
  currencies: Currency[];
  displayCurrency: Currency | null;
}

/**
 * What was PHYSICALLY collected, per currency — the cash actually in hand,
 * before any conversion. Each line prints in its OWN currency (converting it
 * away is the whole point of not showing it), with the USD-equivalent as the
 * quiet second value.
 */
export function CurrencySplit({ rows, currencies, displayCurrency }: Props) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <Text className="text-xs text-gray-400 py-4 text-center">{t("reports.no_cash")}</Text>;
  }

  return (
    <View className="gap-2.5">
      {rows.map((row) => {
        const currency = findCurrency(currencies, row.currencyId);
        return (
          <View key={row.currencyId ?? "USD"} className="flex-row items-center gap-2">
            <Text className="flex-1 text-sm text-gray-700">
              {currency ? currency.code : "USD"}
            </Text>
            <Text fontWeight="Bold" className="text-sm text-gray-900">
              {formatMoney(row.amount, currency, currency)}
            </Text>
            {row.currencyId ? (
              <Text className="text-xs text-gray-400">
                ≈ {formatMoney(row.usd, null, displayCurrency)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
