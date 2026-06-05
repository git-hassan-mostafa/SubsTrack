import type { Product } from "@/src/core/types";
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

interface Props {
  product: Product;
  onEdit: (product: Product) => void;
  onMenu: (product: Product) => void;
}

export function ProductCard({ product, onEdit, onMenu }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const { language } = useLanguageStore();
  const source = findCurrency(currencies, product.currencyId);
  const target = findCurrency(currencies, displayCurrencyId);
  const priceLabel = formatMoney(
    product.price,
    source,
    target,
    language === "ar" ? "ar" : "en-US",
  );

  return (
    <PressableOpacity
      onPress={() => onEdit(product)}
      onLongPress={() => onMenu(product)}
      className={`bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center ${
        product.active ? "" : "opacity-60"
      }`}
    >
      <View className="w-10 h-10 rounded-xl bg-emerald-50 items-center justify-center me-3">
        <Ionicons name="cube-outline" size={18} color={COLORS.success} />
      </View>

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
      </View>

      <View className="items-end me-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {priceLabel}
        </Text>
        <Text className="text-xs text-gray-400">{t("products.per_unit")}</Text>
      </View>

      <PressableOpacity
        onPress={() => onMenu(product)}
        hitSlop={8}
        className="ms-1 w-9 h-9 items-center justify-center rounded-full"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={COLORS.gray600} />
      </PressableOpacity>
    </PressableOpacity>
  );
}
