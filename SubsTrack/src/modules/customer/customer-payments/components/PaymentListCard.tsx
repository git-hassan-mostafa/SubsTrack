import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { COLORS } from "@/src/shared/constants";
import {
  findCurrency,
  formatMoney,
  paymentSnapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDate } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import type { PaymentListItem } from "../utils/types";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";

interface Props {
  payment: PaymentListItem;
  onPress: (payment: PaymentListItem) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (payment: PaymentListItem) => void;
  onEnterSelection?: (payment: PaymentListItem) => void;
}

export function PaymentListCard({
  payment,
  onPress,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const source = paymentSnapshotCurrency(payment, currencies);
  const target = findCurrency(currencies, displayCurrencyId);
  const amountLabel = formatMoney(payment.amountPaid, source, target);

  const paidByName =
    users.find((u) => u.id === payment.receivedByUserId)?.fullName ?? "—";
  const monthLabel = getBlockRangeLabel(
    payment.billingMonth,
    payment.durationMonths,
    t,
  );
  const isVoided = payment.voidedAt !== null;
  // A voided payment collected nothing, so its leftover balance is meaningless —
  // "Voided" replaces the partial badge rather than sitting next to it.
  const isPartial = !isVoided && payment.balance > 0;

  return (
    <PressableOpacity
      onPress={() =>
        selectionMode ? onToggleSelect?.(payment) : onPress(payment)
      }
      onLongPress={
        selectionMode ? undefined : () => onEnterSelection?.(payment)
      }
      className={`bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center ${
        isVoided ? "opacity-60" : ""
      }`}
    >
      {selectionMode ? (
        <View className="w-10 h-10 items-center justify-center me-3 flex-shrink-0">
          <Checkbox checked={selected} />
        </View>
      ) : (
        <View
          className={`w-10 h-10 rounded-xl items-center justify-center me-3 ${
            isVoided ? "bg-gray-100" : "bg-green-50"
          }`}
        >
          <Ionicons
            name={isVoided ? "close-circle-outline" : "cash-outline"}
            size={18}
            color={isVoided ? COLORS.gray500 : COLORS.success}
          />
        </View>
      )}

      <View className="flex-1">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {payment.customerName}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
          {t("payments.paid_by", { name: paidByName })}
          {" · "}
          {formatDate(payment.paidAt, locale)}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
          {t("payments.for_month", { month: monthLabel })}
          {payment.planName ? ` · ${payment.planName}` : ""}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text
          fontWeight="Bold"
          className={`text-base ${
            isVoided ? "text-gray-400 line-through" : "text-gray-900"
          }`}
        >
          {amountLabel}
        </Text>
        {isVoided ? (
          <View className="mt-1 bg-gray-200 rounded-full px-2 py-0.5">
            <Text className="text-[10px] text-gray-600 font-semibold">
              {t("payments.voided_badge")}
            </Text>
          </View>
        ) : isPartial ? (
          <View className="mt-1 bg-amber-100 rounded-full px-2 py-0.5">
            <Text className="text-[10px] text-amber-700 font-semibold">
              {t("payments.partial_badge")}
            </Text>
          </View>
        ) : null}
      </View>
    </PressableOpacity>
  );
}
