import { Modal, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { useSubscriptionStore } from "../store/subscriptionStore";
import type { TierResource, TierCode } from "@/src/core/types";

export interface TierLimitErrorPayload {
  resource: TierResource | "multi_currency" | "multi_month";
  limit: number | null;
  tierCode: TierCode;
}

interface Props {
  payload: TierLimitErrorPayload | null;
  onClose: () => void;
}

export function UpgradePromptModal({ payload, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const tiers = useSubscriptionStore((s) => s.tiers);

  if (!payload) return null;

  const currentTier = tiers.find((tt) => tt.code === payload.tierCode);
  const nextTier = currentTier
    ? tiers
        .filter((tt) => tt.sortOrder > currentTier.sortOrder)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0]
    : null;

  const titleKey =
    payload.resource === "multi_currency"
      ? "subscription.locked.multi_currency_title"
      : payload.resource === "multi_month"
        ? "subscription.locked.multi_month_title"
        : "subscription.locked.limit_reached_title";

  const bodyKey =
    payload.resource === "multi_currency"
      ? "subscription.locked.multi_currency_body"
      : payload.resource === "multi_month"
        ? "subscription.locked.multi_month_body"
        : "subscription.locked.limit_reached_body";

  function handleViewPlans() {
    onClose();
    router.push("/(app)/(tabs)/admin/subscription" as Href);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-6 w-full">
          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-full bg-indigo-50 items-center justify-center">
              <Ionicons name="lock-closed" size={28} color={COLORS.primary} />
            </View>
          </View>

          <Text className="text-lg font-semibold text-gray-900 text-center mb-2">
            {t(titleKey, {
              resource: t(
                `subscription.resource.${payload.resource}`,
                payload.resource,
              ),
              tierName: currentTier?.name ?? payload.tierCode,
            })}
          </Text>

          <Text className="text-sm text-gray-600 text-center mb-5">
            {t(bodyKey, {
              tierName: currentTier?.name ?? payload.tierCode,
              limit: payload.limit ?? "∞",
              nextTierName: nextTier?.name ?? t("subscription.next_tier"),
              resource: t(
                `subscription.resource.${payload.resource}`,
                payload.resource,
              ),
            })}
          </Text>

          <View className="flex-row gap-3">
            <PressableOpacity
              onPress={onClose}
              className="flex-1 border border-gray-300 rounded-lg py-3 items-center"
            >
              <Text className="text-gray-700 font-medium">
                {t("subscription.not_now")}
              </Text>
            </PressableOpacity>
            <PressableOpacity
              onPress={handleViewPlans}
              className="flex-1 bg-primary rounded-lg py-3 items-center"
            >
              <Text className="text-white font-medium">
                {t("subscription.view_plans")}
              </Text>
            </PressableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
