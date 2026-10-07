import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { useSyncStatus } from "@/src/shared/hooks/useSyncStatus";

// Mounted once in the app layout, so it shows on every page while sync runs.
export function SyncIndicator() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const { syncing } = useSyncStatus();

  if (!syncing) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center"
      style={{ top: top + 6 }}
    >
      <View className="flex-row items-center gap-2 rounded-full bg-gray-800 px-3.5 py-1.5 shadow-sm">
        <ActivityIndicator size="small" color="#fff" />
        <Text fontWeight="Medium" className="text-xs text-white">
          {t("settings.syncing")}
        </Text>
      </View>
    </View>
  );
}
