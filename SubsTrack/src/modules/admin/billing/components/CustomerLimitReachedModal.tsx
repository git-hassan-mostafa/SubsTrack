import { Modal, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";
import { useAuth } from "@/src/modules/authentication/auth";
import type { CustomerLimitErrorPayload } from "../utils/types";

interface Props {
  payload: CustomerLimitErrorPayload | null;
  onClose: () => void;
}

export function CustomerLimitReachedModal({ payload, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isTenantWideAdmin } = useAuth();

  if (!payload) return null;

  function handleGoToSettings() {
    onClose();
    router.push("/(app)/(tabs)/admin/tenant-settings" as Href);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
          <View className="bg-amber-50 px-6 pt-6 pb-5 items-center">
            <View className="bg-white rounded-full w-14 h-14 items-center justify-center mb-3 border border-amber-200">
              <Ionicons name="people" size={24} color={COLORS.warning} />
            </View>
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900 text-center mb-1"
            >
              {t("billing.limit_reached_title")}
            </Text>
            <Text className="text-sm text-gray-600 text-center">
              {isTenantWideAdmin
                ? t("billing.limit_reached_body", {
                    count: payload.activeCount,
                    allowance: payload.allowance,
                  })
                : t("billing.limit_reached_contact_admin")}
            </Text>
          </View>
          <View className="px-5 pt-4 pb-5">
            {isTenantWideAdmin ? (
              <PressableOpacity
                onPress={handleGoToSettings}
                className="bg-primary rounded-xl py-3 items-center mb-3"
              >
                <Text fontWeight="Medium" className="text-white">
                  {t("billing.go_to_settings")}
                </Text>
              </PressableOpacity>
            ) : null}
            <PressableOpacity
              onPress={onClose}
              className="border border-gray-300 rounded-xl py-3 items-center"
            >
              <Text fontWeight="Medium" className="text-gray-700">
                {t("common.close")}
              </Text>
            </PressableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
