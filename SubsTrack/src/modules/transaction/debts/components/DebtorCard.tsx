import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
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
        <CardTitle numberOfLines={1}>{debtor.customerName}</CardTitle>
        <CardSubtitle className="mt-0.5" numberOfLines={1}>
          {debtor.oldestDaysLate > 0
            ? t("ledger.oldest_days_late", { count: debtor.oldestDaysLate })
            : t("ledger.not_late_yet")}
          {unpaidCount > 0
            ? ` · ${t("ledger.plus_unpaid_months", {
                count: unpaidCount,
                amount: formatMoney(debtor.unpaidMonthsUsd, null, target),
              })}`
            : ""}
        </CardSubtitle>
      </View>

      <View className="items-end ms-2">
        <CardAmount tone="danger">
          {formatMoney(debtor.debtUsd, null, target)}
        </CardAmount>
      </View>
    </EntityCard>
  );
}
