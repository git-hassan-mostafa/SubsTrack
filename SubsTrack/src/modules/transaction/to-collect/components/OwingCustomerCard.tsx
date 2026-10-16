import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { formatMoney } from "@shared/core/utils/currency";
import { customerOwedUsd } from "@shared/modules/ledger/utils/owedView";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import type { CustomerDebts } from "@shared/core/types";

interface Props {
  debtor: CustomerDebts;
  onPress: () => void;
  onMenu?: () => void;
}

// The amount is everything to collect; the hint counts the plain unpaid months in it.
export function OwingCustomerCard({ debtor, onPress, onMenu }: Props) {
  const { t } = useTranslation();
  const target = useDisplayCurrency();

  const unpaidCount = debtor.unpaidMonths.length;

  return (
    <EntityCard
      avatarName={debtor.customerName}
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
            ? ` · ${t("ledger.unpaid_months_count", { count: unpaidCount })}`
            : ""}
        </CardSubtitle>
      </View>

      <View className="items-end ms-2">
        <CardAmount tone="danger">
          {formatMoney(customerOwedUsd(debtor), null, target)}
        </CardAmount>
      </View>
    </EntityCard>
  );
}
