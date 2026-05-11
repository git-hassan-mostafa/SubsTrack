import type { Plan } from "@/src/core/types";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { Ionicons } from "@expo/vector-icons";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { COLORS } from "@/src/shared/constants";

interface Props {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

export function PlanCard({ plan, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onEdit(plan)}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-4 mb-2.5 flex-row items-center"
    >
      {/* Icon */}
      <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center me-3">
        <Ionicons name="pulse-outline" size={18} color={COLORS.primary} />
      </View>

      {/* Name + count placeholder */}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">
          {plan.name}
        </Text>
        <Text fontWeight="Bold" className="text-xs text-black mt-0.5">
          {plan.isCustomPrice ? "_" : `$${plan.price}`}
        </Text>
      </View>

      {/* Price */}
      <View className="items-end me-2">
        <Text className="text-base font-semibold text-gray-400">
          {plan.isCustomPrice ? t("common.custom") : t("plans.per_month")}
        </Text>
      </View>

      <DirectionalIcon name="chevron-forward" size={16} color={COLORS.gray300} />
    </Pressable>
  );
}
