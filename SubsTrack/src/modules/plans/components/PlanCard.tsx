import type { Plan } from "@/src/core/types";
import { View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { Checkbox } from "@/src/shared/components/Checkbox";

interface Props {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onMenu: (plan: Plan) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (plan: Plan) => void;
  onEnterSelection?: (plan: Plan) => void;
}

export function PlanCard({
  plan,
  onEdit,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const source = findCurrency(currencies, plan.currencyId);
  const target = findCurrency(currencies, displayCurrencyId);
  const priceLabel =
    plan.price != null ? formatMoney(plan.price, source, target) : "";
  return (
    <PressableOpacity
      onPress={() => (selectionMode ? onToggleSelect?.(plan) : onEdit(plan))}
      onLongPress={
        selectionMode ? undefined : () => (onEnterSelection ?? onMenu)(plan)
      }
      className="bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center"
    >
      {/* Icon — replaced by a checkbox in selection mode */}
      {selectionMode ? (
        <View className="w-10 h-10 items-center justify-center me-3 flex-shrink-0">
          <Checkbox checked={selected} />
        </View>
      ) : (
        <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
          <Ionicons name="pulse-outline" size={18} color={COLORS.primary} />
        </View>
      )}

      {/* Name */}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">
          {plan.name}
        </Text>
      </View>

      {/* Price */}
      <View className="items-end me-2">
        {plan.isCustomPrice ? (
          <View className="bg-indigo-50 rounded-lg px-2.5 py-1">
            <Text fontWeight="SemiBold" className="text-xs text-indigo-500">
              {t("common.custom")}
            </Text>
          </View>
        ) : (
          <>
            <Text fontWeight="Bold" className="text-base text-gray-900">
              {priceLabel}
            </Text>
            <Text className="text-xs text-gray-400">
              {plan.durationMonths > 1
                ? t("plans.n_months", { count: plan.durationMonths })
                : t("plans.per_month")}
            </Text>
          </>
        )}
      </View>

      {!selectionMode && (
        <PressableOpacity
          onPress={() => onMenu(plan)}
          hitSlop={8}
          className="ms-1 w-9 h-9 items-center justify-center rounded-full"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.gray600} />
        </PressableOpacity>
      )}
    </PressableOpacity>
  );
}
