import type { Plan } from "@shared/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardMeta,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { useMoneyPair } from "@shared/shared/hooks/useMoneyPair";
import { planDurationLabel } from "@shared/modules/admin/plans/utils/planLabels";
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
  const moneyPair = useMoneyPair();
  const price =
    plan.price != null ? moneyPair(plan.price, plan.currencyId) : null;
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
      <View className="flex-1 me-2">
        <CardTitle numberOfLines={1}>{plan.name}</CardTitle>
      </View>

      <View className="items-end">
        {plan.isCustomPrice ? (
          <Chip text={t("common.custom")} tone="indigo" />
        ) : (
          <>
            <CardAmount>{price?.primary ?? ""}</CardAmount>
            {price?.approx ? <CardMeta>{price.approx}</CardMeta> : null}
            <CardMeta>{planDurationLabel(plan.durationMonths, t)}</CardMeta>
          </>
        )}
      </View>
    </EntityCard>
  );
}
