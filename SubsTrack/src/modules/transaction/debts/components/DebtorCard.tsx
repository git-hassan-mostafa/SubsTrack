import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import type { CustomerDebts } from "@/src/core/types";

interface Props {
  debtor: CustomerDebts;
  onPress: () => void;
  onMenu?: () => void;
}

/**
 * One customer who owes money.
 *
 * Two figures, and they are different things: the bold amount is DEBT — bills
 * with money still owed on them — while the muted hint counts plain unpaid
 * months, which are owed but belong to the month grid's workflow, not this one.
 */
export function DebtorCard({ debtor, onPress, onMenu }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const target = findCurrency(currencies, displayCurrencyId);

  const unpaidCount = debtor.unpaidMonths.length;

  return (
    <EntityCard
      icon="person-outline"
      iconColor={COLORS.danger}
      iconBgClassName="bg-red-50"
      onPress={onPress}
      onMenu={onMenu}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {debtor.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {debtor.oldestDaysLate > 0
            ? t("ledger.oldest_days_late", { count: debtor.oldestDaysLate })
            : t("ledger.not_late_yet")}
          {unpaidCount > 0
            ? ` · ${t("ledger.plus_unpaid_months", {
                count: unpaidCount,
                amount: formatMoney(debtor.unpaidMonthsUsd, null, target),
              })}`
            : ""}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-red-700">
          {formatMoney(debtor.debtUsd, null, target)}
        </Text>
      </View>
    </EntityCard>
  );
}
