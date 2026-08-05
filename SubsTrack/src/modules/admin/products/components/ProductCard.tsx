import type { Product } from "@/src/core/types";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
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
        <Text className="text-base font-semibold text-gray-900">
          {product.name}
        </Text>
        {product.description ? (
          <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
            {product.description}
          </Text>
        ) : null}
        {!product.active ? (
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("products.inactive_badge")}
          </Text>
        ) : null}

        {/* Stock can read negative if two devices sold the last unit offline. */}
        <View className="flex-row mt-1.5">
          <View
            className={`rounded-full px-2 py-0.5 ${inStock ? "bg-emerald-50" : "bg-red-50"}`}
          >
            <Text
              fontWeight="SemiBold"
              className={`text-xs ${inStock ? "text-success" : "text-danger"}`}
            >
              {stockLabel}
            </Text>
          </View>
        </View>
      </View>

      <View className="items-end me-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {priceLabel}
        </Text>
        <Text className="text-xs text-gray-400">{t("products.per_unit")}</Text>
      </View>
    </EntityCard>
  );
}
