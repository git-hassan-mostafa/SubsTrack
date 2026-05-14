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

      {/* Name */}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">
          {plan.name}
        </Text>
      </View>

      {/* Price */}
      <View className="items-end me-3">
        {plan.isCustomPrice ? (
          <View className="bg-indigo-50 rounded-lg px-2.5 py-1">
            <Text fontWeight="SemiBold" className="text-xs text-indigo-500">
              {t("common.custom")}
            </Text>
          </View>
        ) : (
          <>
            <Text fontWeight="Bold" className="text-base text-gray-900">
              ${plan.price}
            </Text>
            <Text className="text-xs text-gray-400">{t("plans.per_month")}</Text>
          </>
        )}
      </View>

      <DirectionalIcon name="chevron-forward" size={16} color={COLORS.gray300} />
    </Pressable>
  );
}
