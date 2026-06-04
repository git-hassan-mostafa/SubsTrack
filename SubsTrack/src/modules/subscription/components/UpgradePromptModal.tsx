import { Modal, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import type { TierPlan, TierResource, TierCode } from "@/src/core/types";

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
  const user = useAuthSlice((s) => s.user);
  const tiers = useSubscriptionSlice((s) => s.tiers);

  if (!payload) return null;

  const isTenantWideAdmin = user?.branchId === null;
  const currentTier = tiers.find((tt) => tt.code === payload.tierCode);
  const upgradeTiers = currentTier
    ? tiers
        .filter((tt) => tt.sortOrder > currentTier.sortOrder)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  function handleViewPlans() {
    onClose();
    router.push("/(app)/(tabs)/admin/subscription" as Href);
  }

  // Branch-scoped admins / staff can't change subscriptions — show a simple
  // notice instead of the upgrade CTA.
  if (!isTenantWideAdmin) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View className="flex-1 bg-black/50 items-center justify-center px-8">
          <View className="bg-white rounded-2xl p-6 w-full">
            <Text fontWeight="Bold" className="text-lg text-gray-900 text-center mb-2">
              {t("subscription.locked.contact_admin_title")}
            </Text>
            <Text className="text-sm text-gray-600 text-center mb-5">
              {t("subscription.locked.contact_admin_body")}
            </Text>
            <PressableOpacity
              onPress={onClose}
              className="bg-primary rounded-lg py-3 items-center"
            >
              <Text className="text-white font-medium">{t("common.close")}</Text>
            </PressableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const headline =
    payload.resource === "multi_currency"
      ? t("subscription.locked.multi_currency_title")
      : payload.resource === "multi_month"
        ? t("subscription.locked.multi_month_title")
        : t("subscription.locked.limit_reached_title", {
            resource: t(
              `subscription.resource.${payload.resource}`,
              payload.resource,
            ),
          });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
          <ScrollView
            className="max-h-[80%]"
            contentContainerStyle={{ padding: 20 }}
            showsVerticalScrollIndicator={false}
          >
            <Text fontWeight="Bold" className="text-xl text-gray-900 mb-1">
              {t("subscription.locked.upgrade_title")}
            </Text>
            <Text className="text-sm text-gray-600 mb-5">{headline}</Text>

            {upgradeTiers.map((tier) => (
              <TierPreviewCard key={tier.id} tier={tier} />
            ))}

            <View className="flex-row gap-3 mt-1">
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TierPreviewCard({ tier }: { tier: TierPlan }) {
  const { t } = useTranslation();

  const lines: string[] = [];
  lines.push(
    tier.maxCustomers === null
      ? `${t("subscription.unlimited")} ${t("subscription.resource.customers").toLowerCase()}`
      : `${t("subscription.up_to", { count: tier.maxCustomers })} ${t("subscription.resource.customers").toLowerCase()}`,
  );
  lines.push(
    tier.maxUsers === null
      ? `${t("subscription.unlimited")} ${t("subscription.resource.users").toLowerCase()}`
      : `${t("subscription.up_to", { count: tier.maxUsers })} ${t("subscription.resource.users").toLowerCase()}`,
  );
  if (tier.multiMonthPlansEnabled) lines.push(t("subscription.feature.multi_month"));
  if (tier.multiCurrencyEnabled) lines.push(t("subscription.feature.multi_currency"));

  return (
    <View className="border border-gray-200 rounded-xl p-4 mb-3">
      <View className="flex-row items-baseline justify-between mb-3">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {tier.name}
        </Text>
        <View className="flex-row items-baseline">
          <Text fontWeight="Bold" className="text-lg text-primary">
            ${tier.priceMonthlyUsd}
          </Text>
          <Text className="text-xs text-gray-500 ms-1">
            {t("subscription.per_month")}
          </Text>
        </View>
      </View>
      {lines.map((line) => (
        <View key={line} className="flex-row items-center mb-1">
          <Ionicons name="checkmark" size={14} color={COLORS.success} />
          <Text className="text-xs text-gray-700 ms-2">{line}</Text>
        </View>
      ))}
    </View>
  );
}
