import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import type { DebtCategory, DebtItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { formatDate } from "@/src/core/utils/date";

interface Props {
  item: DebtItem;
  // Only custom debts can be voided from here (months/sales are derived — void
  // the underlying payment/sale in their own tab). Omit for non-custom rows.
  onVoid?: (item: DebtItem) => void;
}

const CATEGORY_STYLE: Record<
  DebtCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; badge: string }
> = {
  months: { icon: "calendar-outline", color: COLORS.primary, bg: "bg-indigo-50", badge: "bg-indigo-50 text-indigo-700" },
  sales: { icon: "receipt-outline", color: COLORS.success, bg: "bg-emerald-50", badge: "bg-emerald-50 text-emerald-700" },
  services: { icon: "construct-outline", color: COLORS.gray500, bg: "bg-gray-100", badge: "bg-gray-100 text-gray-600" },
  custom: { icon: "document-text-outline", color: COLORS.warning, bg: "bg-amber-50", badge: "bg-amber-50 text-amber-700" },
};

export function DebtItemCard({ item, onVoid }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const source = paymentSnapshotCurrency(item, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(item.remaining, source, target);
  const style = CATEGORY_STYLE[item.category];
  const canVoid = item.category === "custom" && !!onVoid;

  return (
    <EntityCard
      icon={style.icon}
      iconColor={style.color}
      iconBgClassName={style.bg}
      onPress={canVoid ? () => onVoid?.(item) : undefined}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {item.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {item.label}
          {" · "}
          {formatDate(item.date, locale)}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {amountLabel}
        </Text>
        <Text
          className={`text-[10px] font-semibold uppercase tracking-wide mt-1 px-1.5 py-0.5 rounded ${style.badge}`}
        >
          {t(`debts.category_${item.category}`)}
        </Text>
      </View>
    </EntityCard>
  );
}
