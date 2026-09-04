import type { Service } from "@/src/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
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
        <Text className="text-base font-semibold text-gray-900">
          {service.name}
        </Text>
        {service.description ? (
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {service.description}
          </Text>
        ) : null}
        {!service.active ? (
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("services.inactive_badge")}
          </Text>
        ) : null}
      </View>

      <View className="items-end me-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {priceLabel}
        </Text>
        <Text className="text-xs text-gray-400">{t("services.per_job")}</Text>
      </View>
    </EntityCard>
  );
}
