import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { Currency } from "@/src/core/types";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";

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
    <PressableOpacity
      onPress={() =>
        selectionMode ? onToggleSelect?.(currency) : onEdit(currency)
      }
      onLongPress={
        selectionMode ? undefined : () => (onEnterSelection ?? onMenu)(currency)
      }
      className={`bg-white border rounded-2xl px-4 py-4 mb-2.5 flex-row items-center ${
        currency.active ? "border-gray-100" : "border-gray-200 opacity-60"
      }`}
    >
      {selectionMode ? (
        <View className="w-10 h-10 items-center justify-center me-3 flex-shrink-0">
          <Checkbox checked={selected} />
        </View>
      ) : (
        <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
          <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-gray-900">
            {currency.code}
          </Text>
          {!currency.active ? (
            <View className="bg-gray-100 rounded-lg px-2 py-0.5 ms-2">
              <Text className="text-[10px] font-semibold text-gray-500 uppercase">
                {t("common.inactive")}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
          {currency.name}
        </Text>
      </View>

      <View className="items-end me-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {rateLabel}
        </Text>
        <Text className="text-xs text-gray-400">
          {t("tenant_settings.rate_per_usd", { code: currency.code })}
        </Text>
      </View>

      {!selectionMode && (
        <PressableOpacity
          onPress={() => onMenu(currency)}
          hitSlop={8}
          className="ms-1 w-9 h-9 items-center justify-center rounded-full"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={COLORS.gray600} />
        </PressableOpacity>
      )}
    </PressableOpacity>
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
        <Text className="text-base font-semibold text-gray-900">USD</Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {t("tenant_settings.usd_base_note")}
        </Text>
      </View>
      <View className="items-end">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          1
        </Text>
        <Text className="text-xs text-gray-400">
          {t("tenant_settings.base")}
        </Text>
      </View>
    </View>
  );
}
