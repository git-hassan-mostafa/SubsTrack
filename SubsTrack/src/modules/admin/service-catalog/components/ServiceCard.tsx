import type { Service } from "@shared/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardChips,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { COLORS } from "@/src/shared/constants";
import { useMoneyPair } from "@shared/shared/hooks/useMoneyPair";
import { EntityCard } from "@/src/shared/components/EntityCard";

interface Props {
  service: Service;
  onEdit: (service: Service) => void;
  onMenu: (service: Service) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (service: Service) => void;
  onEnterSelection?: (service: Service) => void;
}

export function ServiceCard({
  service,
  onEdit,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const price = useMoneyPair()(service.price, service.currencyId);

  return (
    <EntityCard
      icon="construct-outline"
      iconColor={COLORS.primary}
      iconBgClassName="bg-blue-50"
      dimmed={!service.active}
      onPress={() => onEdit(service)}
      onMenu={() => onMenu(service)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(service)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(service) : undefined
      }
    >
      <View className="flex-1 me-2">
        <CardTitle numberOfLines={1}>{service.name}</CardTitle>
        {service.description ? (
          <CardSubtitle className="mt-0.5" numberOfLines={1}>
            {service.description}
          </CardSubtitle>
        ) : null}
        {!service.active ? (
          <CardChips>
            <Chip text={t("common.inactive")} tone="gray" />
          </CardChips>
        ) : null}
      </View>

      <View className="items-end me-2">
        <CardAmount>{price.primary}</CardAmount>
        {price.approx ? <CardMeta>{price.approx}</CardMeta> : null}
        <CardMeta>{t("services.per_job")}</CardMeta>
      </View>
    </EntityCard>
  );
}
