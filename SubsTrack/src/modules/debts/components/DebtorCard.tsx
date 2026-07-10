import { View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import type { Debtor } from "../utils/debtAggregations";

interface Props {
  debtor: Debtor;
  onPress: () => void;
}

// One row on the Debtors sub-tab: a customer who still owes money, with their
// total net debt (USD, formatted into the display currency). Tapping opens the
// debtor detail modal.
export function DebtorCard({ debtor, onPress }: Props) {
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);

  return (
    <EntityCard
      icon="person-outline"
      iconColor={COLORS.warning}
      iconBgClassName="bg-amber-50"
      onPress={onPress}
    >
      <View className="flex-1">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {debtor.customerName}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {formatMoney(debtor.netUsd, null, target)}
        </Text>
      </View>
    </EntityCard>
  );
}
