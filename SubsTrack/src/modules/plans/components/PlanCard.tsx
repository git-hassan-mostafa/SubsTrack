import type { Plan } from "@/src/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useUiPrefStore } from "@/src/shared/lib/uiPrefStore";
import { EntityCard } from "@/src/shared/components/EntityCard";

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
  const source = findCurrency(currencies, plan.currencyId);
  const target = findCurrency(currencies, displayCurrencyId);
  const priceLabel =
    plan.price != null ? formatMoney(plan.price, source, target) : "";
  return (
    <EntityCard
      icon="pulse-outline"
      onPress={() => onEdit(plan)}
      onMenu={() => onMenu(plan)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(plan)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(plan) : undefined
      }
    >
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
    </EntityCard>
  );
}
