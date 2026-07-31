import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { useAppUpdate } from "@/src/shared/hooks/useAppUpdate";

// Clears the tab bar, whose height is `64 + bottom inset` in (tabs)/_layout.
const TAB_BAR_HEIGHT = 64;

/**
 * Global "a newer version is ready" prompt. Mounted once in the authenticated
 * app layout, and renders nothing until an OTA update has finished downloading.
 * Sits at the bottom so it never collides with the top-centered SyncIndicator
 * on launch, when both are likely to appear at once.
 */
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
      <View className="flex-row items-center gap-2.5 rounded-full bg-gray-800 ps-3.5 pe-1.5 py-1.5 shadow-sm">
        <Ionicons name="arrow-down-circle-outline" size={16} color="#fff" />
        <Text className="text-xs font-medium text-white">
          {t("update.ready")}
        </Text>
        <PressableOpacity
          onPress={apply}
          className="rounded-full bg-white px-3 py-1"
        >
          <Text fontWeight="SemiBold" className="text-xs text-gray-800">
            {t("update.restart")}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  );
}
