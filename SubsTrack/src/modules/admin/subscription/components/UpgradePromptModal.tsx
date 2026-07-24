import { Modal, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { useAuthSlice } from "@/src/state/hooks/useAuthSlice";
import { useSubscriptionSlice } from "@/src/state/hooks/useSubscriptionSlice";
import type { TierPlan } from "@/src/core/types";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { CanUpgrade } from "@/src/shared/components/FeatureGate";
import { TierLimitErrorPayload } from "../utils/types";
import { ContactToUpgradeButton } from "./ContactToUpgradeButton";
import { useWebBackDismiss } from "@/src/shared/hooks/useWebBackDismiss";

interface Props {
  payload: TierLimitErrorPayload | null;
  onClose: () => void;
}

export function UpgradePromptModal({ payload, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthSlice((s) => s.user);
  const tiers = useSubscriptionSlice((s) => s.tiers);

  // Web: browser Back closes the modal instead of navigating the route.
  useWebBackDismiss(!!payload, onClose);

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
          <View className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
            <View className="bg-amber-50 px-6 pt-6 pb-5 items-center">
              <View className="bg-white rounded-full w-14 h-14 items-center justify-center mb-3 border border-amber-200">
                <Ionicons name="lock-closed" size={24} color={COLORS.warning} />
              </View>
              <Text
                fontWeight="Bold"
                className="text-lg text-gray-900 text-center mb-1"
              >
                {t("subscription.locked.contact_admin_title")}
              </Text>
              <Text className="text-sm text-gray-600 text-center">
                {t("subscription.locked.contact_admin_body")}
              </Text>
            </View>
            <View className="px-5 pt-4">
              <PressableOpacity
                onPress={onClose}
                className="bg-primary rounded-xl py-3 items-center"
              >
                <Text className="text-white font-medium">
                  {t("common.close")}
                </Text>
              </PressableOpacity>
            </View>
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
        <View className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
          <View className="bg-primary px-5 pt-5 pb-5">
            <View className="flex-row items-start justify-between mb-3">
              <View className="bg-white/20 rounded-2xl w-11 h-11 items-center justify-center">
                <Ionicons name="rocket" size={22} color={COLORS.white} />
              </View>
              <PressableOpacity
                onPress={onClose}
                hitSlop={8}
                className="bg-white/20 rounded-full w-8 h-8 items-center justify-center"
              >
                <Ionicons name="close" size={16} color={COLORS.white} />
              </PressableOpacity>
            </View>
            <Text fontWeight="Bold" className="text-white text-xl mb-1">
              {t("subscription.locked.upgrade_title")}
            </Text>
            <Text className="text-white/80 text-xs leading-4">{headline}</Text>
          </View>

          <View className="px-4 pt-4">
            {upgradeTiers.map((tier, index) => (
              <TierPreviewCard
                key={tier.id}
                tier={tier}
                highlighted={index === 0}
              />
            ))}
          </View>

          <View className="flex-row gap-2 px-4 pt-1 pb-4">
            <PressableOpacity
              onPress={onClose}
              className="flex-1 border border-gray-200 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-700 font-medium text-sm">
                {t("subscription.not_now")}
              </Text>
            </PressableOpacity>
            <CanUpgrade
              fallback={
                <ContactToUpgradeButton
                  tierName={upgradeTiers[0]?.name}
                  className="flex-[1.4] rounded-xl"
                />
              }
            >
              <PressableOpacity
                onPress={handleViewPlans}
                className="flex-[1.4] bg-primary rounded-xl py-3 flex-row items-center justify-center"
              >
                <Text className="text-white font-medium text-sm">
                  {t("subscription.view_plans")}
                </Text>
                <View className="ms-1.5">
                  <DirectionalIcon
                    name="arrow-forward"
                    size={14}
                    color={COLORS.white}
                  />
                </View>
              </PressableOpacity>
            </CanUpgrade>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TierPreviewCard({
  tier,
  highlighted,
}: {
  tier: TierPlan;
  highlighted?: boolean;
}) {
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
  if (tier.multiMonthPlansEnabled)
    lines.push(t("subscription.feature.multi_month"));
  if (tier.multiCurrencyEnabled)
    lines.push(t("subscription.feature.multi_currency"));

  return (
    <View
      className={`rounded-2xl p-3.5 mb-2.5 border ${
        highlighted
          ? "border-primary bg-indigo-50/40"
          : "border-gray-200 bg-white"
      }`}
    >
      <View className="flex-row items-center justify-between mb-2.5">
        <View className="flex-row items-center">
          <View
            className={`w-7 h-7 rounded-full items-center justify-center me-2 ${
              highlighted ? "bg-primary" : "bg-gray-100"
            }`}
          >
            <Ionicons
              name="star"
              size={13}
              color={highlighted ? COLORS.white : COLORS.gray500}
            />
          </View>
          <Text fontWeight="Bold" className="text-base text-gray-900">
            {tier.name}
          </Text>
        </View>
        <View className="flex-row items-baseline">
          <Text
            fontWeight="Bold"
            className={`text-lg ${highlighted ? "text-primary" : "text-gray-900"}`}
          >
            ${tier.priceMonthlyUsd}
          </Text>
          <Text className="text-[10px] text-gray-500 ms-1">
            {t("subscription.per_month")}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap">
        {lines.map((line) => (
          <View key={line} className="flex-row items-center me-3 mb-1">
            <Ionicons
              name="checkmark-circle"
              size={13}
              color={COLORS.success}
            />
            <Text className="text-[11px] text-gray-700 ms-1">{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
