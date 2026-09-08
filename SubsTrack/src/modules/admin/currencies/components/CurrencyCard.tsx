import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { Currency } from "@/src/core/types";
import {
  CardAmount,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { COLORS } from "@/src/shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";

interface Props {
  currency: Currency;
  onEdit: (currency: Currency) => void;
  onMenu: (currency: Currency) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (currency: Currency) => void;
  onEnterSelection?: (currency: Currency) => void;
}

export function CurrencyCard({
  currency,
  onEdit,
  onMenu,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();
  const rateLabel = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(currency.ratePerUsd);

  return (
    <EntityCard
      icon="cash-outline"
      dimmed={!currency.active}
      onPress={() => onEdit(currency)}
      onMenu={() => onMenu(currency)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(currency)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(currency) : undefined
      }
    >
      <View className="flex-1">
        <View className="flex-row items-center">
          <CardTitle>{currency.code}</CardTitle>
          {!currency.active ? (
            <View className="ms-2">
              <Chip text={t("common.inactive")} tone="gray" />
            </View>
          ) : null}
        </View>
        <CardSubtitle className="mt-0.5" numberOfLines={1}>
          {currency.name}
        </CardSubtitle>
      </View>

      <View className="items-end me-2">
        <CardAmount>{rateLabel}</CardAmount>
        <CardMeta>
          {t("tenant_settings.rate_per_usd", { code: currency.code })}
        </CardMeta>
      </View>
    </EntityCard>
  );
}

// Pinned, non-editable USD row shown at the top of the currencies list.
export function UsdBaseCard() {
  const { t } = useTranslation();
  return (
    <View className="bg-indigo-50/40 border border-indigo-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center">
      <View className="w-10 h-10 rounded-xl bg-white items-center justify-center me-3">
        <Ionicons name="star" size={18} color={COLORS.primary} />
      </View>
      <View className="flex-1">
        <CardTitle>USD</CardTitle>
        <CardSubtitle className="mt-0.5">
          {t("tenant_settings.usd_base_note")}
        </CardSubtitle>
      </View>
      <View className="items-end">
        <CardAmount>1</CardAmount>
        <CardMeta>{t("tenant_settings.base")}</CardMeta>
      </View>
    </View>
  );
}
