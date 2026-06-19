import { memo } from "react";
import { ActivityIndicator, View } from "react-native";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Checkbox } from "@/src/shared/components/Checkbox";
import type { Customer } from "@/src/core/types";
import { COLORS } from "../../../shared/constants";

interface Props {
  customer: Customer;
  paymentStatus: "paid" | "partial" | "unpaid";
  monthLabel: string;
  onPress: (customer: Customer) => void;
  onMenu: (customer: Customer) => void;
  menuLoading?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (customer: Customer) => void;
  onEnterSelection?: (customer: Customer) => void;
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  paymentStatus,
  monthLabel,
  onPress,
  onMenu,
  menuLoading = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();

  return (
    <PressableOpacity
      onPress={() =>
        selectionMode ? onToggleSelect?.(customer) : onPress(customer)
      }
      onLongPress={
        selectionMode ? undefined : () => (onEnterSelection ?? onMenu)(customer)
      }
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-center"
    >
      {/* Avatar — replaced by a checkbox in selection mode (same footprint) */}
      {selectionMode ? (
        <View className="w-10 h-10 items-center justify-center me-3 flex-shrink-0">
          <Checkbox checked={selected} />
        </View>
      ) : (
        <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
          <Ionicons name="person-outline" size={18} color={COLORS.primary} />
        </View>
      )}

      {/* Name + Plan */}
      <View className="flex-1 me-2">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {customer.name}
        </Text>
        <Text className="text-sm text-gray-400 mt-0.5" numberOfLines={1}>
          {customer.plan?.name ?? t("common.no_plan")}
        </Text>
        {!!customer.phoneNumber && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="call-outline" size={12} color={COLORS.gray400} />
            <Text className="text-xs text-gray-400 ms-1" numberOfLines={1}>
              {customer.phoneNumber}
            </Text>
          </View>
        )}
      </View>

      {/* Status + Date */}
      <View className="items-end">
        {!customer.active ? (
          <View className="bg-gray-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-medium text-gray-500">
              {t("common.inactive")}
            </Text>
          </View>
        ) : !customer.isRegular ? (
          <View className="bg-amber-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-amber-600">
              {t("customers.non_regular")}
            </Text>
          </View>
        ) : paymentStatus === "paid" ? (
          <View className="bg-green-50 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-green-600">
              ✓ {t("common.paid")}
            </Text>
          </View>
        ) : paymentStatus === "partial" ? (
          <View className="bg-amber-50 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-amber-600">
              {t("common.partial")}
            </Text>
          </View>
        ) : (
          <View className="bg-red-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-red-500">
              {t("dashboard.unpaid")}
            </Text>
          </View>
        )}
        <Text className="text-xs text-gray-400">{monthLabel}</Text>
      </View>

      {!selectionMode && (
        <PressableOpacity
          onPress={() => onMenu(customer)}
          disabled={menuLoading}
          hitSlop={8}
          className="ms-2 w-9 h-9 items-center justify-center rounded-full"
        >
          {menuLoading ? (
            <ActivityIndicator size="small" color={COLORS.gray600} />
          ) : (
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={COLORS.gray600}
            />
          )}
        </PressableOpacity>
      )}
    </PressableOpacity>
  );
});
