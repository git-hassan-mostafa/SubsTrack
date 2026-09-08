import type { Service } from "@/src/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  CardAmount,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { COLORS } from "@/src/shared/constants";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
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
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const source = findCurrency(currencies, service.currencyId);
  const target = findCurrency(currencies, displayCurrencyId);
  const priceLabel = formatMoney(service.price, source, target);

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
      <View className="flex-1">
        <CardTitle>{service.name}</CardTitle>
        {service.description ? (
          <CardSubtitle className="mt-0.5" numberOfLines={1}>
            {service.description}
          </CardSubtitle>
        ) : null}
        {!service.active ? (
          <View className="mt-1.5 flex-row">
            <Chip text={t("services.inactive_badge")} tone="gray" />
          </View>
        ) : null}
      </View>

      <View className="items-end me-2">
        <CardAmount>{priceLabel}</CardAmount>
        <CardMeta>{t("services.per_job")}</CardMeta>
      </View>
    </EntityCard>
  );
}
