import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Sale } from "@/src/core/types";
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
  sale: Sale;
  onPress: (sale: Sale) => void;
}

export function SaleCard({ sale, onPress }: Props) {
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
  const totalLabel = formatMoney(sale.totalAmount, source, target);

  return (
    <PressableOpacity
      onPress={() => onPress(sale)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center"
    >
      <View className="w-10 h-10 rounded-xl bg-emerald-50 items-center justify-center me-3">
        <Ionicons name="receipt-outline" size={18} color={COLORS.success} />
      </View>

      <View className="flex-1">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {sale.productNameSnapshot}
          {sale.quantity > 1 ? ` × ${sale.quantity}` : ""}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {sale.customer?.name ?? t("sales.walk_in")}
          {" · "}
          {formatDate(sale.soldAt, locale)}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {totalLabel}
        </Text>
      </View>
    </PressableOpacity>
  );
}
