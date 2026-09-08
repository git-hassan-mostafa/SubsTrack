import type { Product } from "@/src/core/types";
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
  product: Product;
  onEdit: (product: Product) => void;
  onMenu: (product: Product) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (product: Product) => void;
  onEnterSelection?: (product: Product) => void;
}

export function ProductCard({
  product,
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
  const source = findCurrency(currencies, product.currencyId);
  const target = findCurrency(currencies, displayCurrencyId);
  const priceLabel = formatMoney(product.price, source, target);
  const inStock = product.stockOnHand > 0;
  const stockLabel = inStock
    ? t("products.in_stock", { quantity: product.stockOnHand })
    : product.stockOnHand < 0
      ? t("products.oversold", { quantity: -product.stockOnHand })
      : t("products.out_of_stock");

  return (
    <EntityCard
      icon="cube-outline"
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      dimmed={!product.active}
      onPress={() => onEdit(product)}
      onMenu={() => onMenu(product)}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(product)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(product) : undefined
      }
    >
      <View className="flex-1">
        <CardTitle>{product.name}</CardTitle>
        {product.description ? (
          <CardSubtitle className="mt-0.5" numberOfLines={1}>
            {product.description}
          </CardSubtitle>
        ) : null}

        <View className="mt-1.5 flex-row flex-wrap items-center gap-1">
          {!product.active ? (
            <Chip text={t("products.inactive_badge")} tone="gray" />
          ) : null}
          <Chip
            text={stockLabel}
            tone={inStock ? "emerald" : "red"}
            size="md"
          />
        </View>
      </View>

      <View className="items-end me-2">
        <CardAmount>{priceLabel}</CardAmount>
        <CardMeta>{t("products.per_unit")}</CardMeta>
      </View>
    </EntityCard>
  );
}
