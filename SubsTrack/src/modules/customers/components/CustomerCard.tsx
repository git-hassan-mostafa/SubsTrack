import { memo } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import type { Customer } from "@/src/core/types";
import { AVATAR_COLORS } from "../../../shared/constants";

interface Props {
  customer: Customer;
  isPaidThisMonth: boolean;
  monthLabel: string;
  onPress: (customer: Customer) => void;
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  isPaidThisMonth,
  monthLabel,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const initials = getInitials(customer.name);
  const avatarColor = getAvatarColor(customer.name);

  return (
    <Pressable
      onPress={() => onPress(customer)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 mb-2.5 flex-row items-center"
    >
      {/* Avatar */}
      <View
        className="w-10 h-10 rounded-xl items-center justify-center me-3 flex-shrink-0"
        style={{ backgroundColor: avatarColor + "22" }}
      >
        <Text
          fontWeight="Bold"
          className="text-sm"
          style={{ color: avatarColor }}
        >
          {initials}
        </Text>
      </View>

      {/* Name + Plan */}
      <View className="flex-1 me-2">
        <Text
          className="text-base font-semibold text-gray-900"
          numberOfLines={1}
        >
          {customer.name}
        </Text>
        <Text className="text-sm text-gray-400 mt-0.5">
          {customer.plan?.name ?? t("common.no_plan")}
        </Text>
      </View>

      {/* Status + Date */}
      <View className="items-end">
        {!customer.active ? (
          <View className="bg-gray-100 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-medium text-gray-500">
              {t("common.inactive")}
            </Text>
          </View>
        ) : isPaidThisMonth ? (
          <View className="bg-green-50 rounded-lg px-2 py-0.5 mb-1">
            <Text className="text-xs font-semibold text-green-600">
              ✓ {t("common.paid")}
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
    </Pressable>
  );
});
