import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import type { DebtPaymentItem } from "@/src/core/types";
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
  payment: DebtPaymentItem;
  onVoid?: (payment: DebtPaymentItem) => void;
}

export function DebtPaymentCard({ payment, onVoid }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const source = paymentSnapshotCurrency(payment, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(payment.amount, source, target);

  return (
    <EntityCard
      icon="cash-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      onPress={onVoid ? () => onVoid(payment) : undefined}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {payment.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {payment.notes?.trim()
            ? payment.notes
            : t("debts.debt_payment")}
          {" · "}
          {formatDate(payment.paidAt, locale)}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-green-600">
          {"- "}
          {amountLabel}
        </Text>
      </View>
    </EntityCard>
  );
}
