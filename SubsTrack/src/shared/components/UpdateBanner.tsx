import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { PressableOpacity } from "./PressableOpacity";
import { useAppUpdate } from "@/src/shared/hooks/useAppUpdate";
import { COLORS } from "@/src/shared/constants";
import { TAB_BAR_HEIGHT } from "./AppTabBar";

// Renders nothing until an OTA update has finished downloading.
export function UpdateBanner() {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { updateReady, apply } = useAppUpdate();

  if (!updateReady) return null;

  return (
    <View
      className="absolute inset-x-0 items-center"
      style={{ bottom: bottom + TAB_BAR_HEIGHT + 8 }}
    >
      <View className="flex-row items-center gap-3 rounded-full bg-gray-800 ps-4 pe-1.5 py-1.5 elevation-md">
        <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.white} />
        <Text fontWeight="Medium" className="text-sm text-white">
          {t("update.ready")}
        </Text>
        <PressableOpacity
          onPress={apply}
          containerClassName="rounded-full bg-white"
          className="px-4 py-1.5"
        >
          <Text fontWeight="SemiBold" className="text-sm text-gray-800">
            {t("update.restart")}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  );
}
