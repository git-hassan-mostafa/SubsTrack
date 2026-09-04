import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Currency, Sale } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";
import { receiptId } from "@/src/core/utils/receiptId";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { Chip } from "@/src/shared/components/Chip";

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
  onMenu?: (sale: Sale) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (sale: Sale) => void;
  onEnterSelection?: (sale: Sale) => void;
}

export function SaleCard({
  sale,
  onPress,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const source = snapshotCurrency(sale, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const voided = sale.voidedAt !== null;
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
      dimmed={voided}
      onPress={() => onPress(sale)}
      onMenu={onMenu ? () => onMenu(sale) : undefined}
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
          #{receiptId(sale.id)}
        </Text>
        <Text className="text-xs text-gray-700 mt-0.5" numberOfLines={1}>
          {sale.itemsSummary}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {sale.customer?.name ?? t("sales.walk_in")}
          {" · "}
          {formatDate(sale.soldAt, locale)}
        </Text>
        {voided ? (
          <View className="mt-1 flex-row">
            <Chip
              text={
                sale.voidReason
                  ? `${t("sales.voided")} · ${sale.voidReason}`
                  : t("sales.voided")
              }
              className="bg-red-50 text-red-700"
            />
          </View>
        ) : null}
      </View>

      <View className="items-end ms-2">
        <Text
          fontWeight="Bold"
          className={`text-sm ${
            voided
              ? "text-gray-400 line-through"
              : fullyPaid
                ? "text-gray-900"
                : "text-red-600"
          }`}
        >
          {totalLabel}
        </Text>
      </View>
    </EntityCard>
  );
}
