import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Sale } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";
import { EntityCard } from "@/src/shared/components/EntityCard";

// Strips the trailing currency symbol/code that formatMoney appends, so a
// paid/total fraction shows the currency label once instead of twice.
function stripCurrencyLabel(
  formatted: string,
  target: Currency | null,
): string {
  if (!target) return formatted.replace(/^\$/, "");
  const suffix = ` ${target.symbol || target.code}`;
  return formatted.endsWith(suffix)
    ? formatted.slice(0, -suffix.length)
    : formatted;
}

interface Props {
  sale: Sale;
  onPress: (sale: Sale) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sale: Sale) => void;
  onEnterSelection?: (sale: Sale) => void;
}

export function SaleCard({
  sale,
  onPress,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  // paymentSnapshotCurrency works for any row carrying a `currencyId` +
  // `ratePerUsdSnapshot` pair (it's not payment-specific despite the name).
  // The Sale shape matches that contract.
  const source = paymentSnapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const fullyPaid = sale.amountPaid >= sale.totalAmount;
  const totalFormatted = formatMoney(sale.totalAmount, source, target);
  const totalLabel = fullyPaid
    ? totalFormatted
    : `${stripCurrencyLabel(formatMoney(sale.amountPaid, source, target), target)}/${totalFormatted}`;

  return (
    <EntityCard
      icon="receipt-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      onPress={() => onPress(sale)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(sale)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(sale) : undefined
      }
    >
      <View className="flex-1">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {sale.itemsSummary}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {sale.customer?.name ?? t("sales.walk_in")}
          {" · "}
          {formatDate(sale.soldAt, locale)}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text
          fontWeight="Bold"
          className={`text-sm ${fullyPaid ? "text-gray-900" : "text-red-600"}`}
        >
          {totalLabel}
        </Text>
      </View>
    </EntityCard>
  );
}
