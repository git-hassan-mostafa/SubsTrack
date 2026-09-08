import type { Plan } from "@/src/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardMeta,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
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
  const displayCurrencyId = useDisplayCurrencyId();
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
      <View className="flex-1">
        <CardTitle>{plan.name}</CardTitle>
      </View>

      <View className="items-end me-2">
        {plan.isCustomPrice ? (
          <Chip text={t("common.custom")} tone="indigo" size="md" />
        ) : (
          <>
            <CardAmount>{priceLabel}</CardAmount>
            <CardMeta>
              {plan.durationMonths > 1
                ? t("plans.n_months", { count: plan.durationMonths })
                : t("plans.per_month")}
            </CardMeta>
          </>
        )}
      </View>
    </EntityCard>
  );
}
