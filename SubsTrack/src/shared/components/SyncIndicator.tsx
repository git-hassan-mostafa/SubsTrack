import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Text } from "./Text";
import { useSyncStatus } from "@/src/shared/hooks/useSyncStatus";
import { IS_OFFLINE_CAPABLE } from "@/src/core/offline";

/**
 * Global "syncing" marker. Mounted once in the authenticated app layout so it
 * shows on every page whenever the sync engine is running — manual (Sync now)
 * or automatic (reconnect / foreground / periodic / after a write). Floats at
 * the top center, above screen content, and renders nothing when idle or on
 * web (offline sync is native-only).
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const { syncing } = useSyncStatus();

  if (!IS_OFFLINE_CAPABLE || !syncing) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center"
      style={{ top: top + 6 }}
    >
      <View className="flex-row items-center gap-2 rounded-full bg-gray-800 px-3.5 py-1.5 shadow-sm">
        <ActivityIndicator size="small" color="#fff" />
        <Text className="text-xs font-medium text-white">
          {t("settings.syncing")}
        </Text>
      </View>
    </View>
  );
}
