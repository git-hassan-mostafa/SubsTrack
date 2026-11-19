import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { formatDateTimeShort } from "@shared/core/utils/date";
import { endSession } from "@shared/shared/lib/session";
import {
  lastServerContactAt,
  SYNC_REQUIRED_AFTER_DAYS,
} from "@/src/core/offline";
import { useManualSync } from "@/src/shared/hooks/useManualSync";
import { useSyncStatus } from "@/src/shared/hooks/useSyncStatus";
import { Button } from "./Button";
import { ErrorBanner } from "./ErrorBanner";
import { Text } from "./Text";

// Covers the app instead of replacing <Slot />, so an open form survives the sync.
export function SyncRequiredScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const status = useSyncStatus();
  const { syncing, error, clearError, sync } = useManualSync();
  const lastSyncedAt = lastServerContactAt(status);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}
      className="bg-white px-5 justify-center"
    >
      <Text fontWeight="SemiBold" className="text-xl text-gray-900 mb-2">
        {t("sync_required.title")}
      </Text>
      <Text className="text-base text-gray-500 mb-2">
        {t("sync_required.message", { days: SYNC_REQUIRED_AFTER_DAYS })}
      </Text>
      {lastSyncedAt ? (
        <Text className="text-sm text-gray-500 mb-6">
          {t("sync_required.last_synced", {
            time: formatDateTimeShort(lastSyncedAt),
          })}
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
      <View className="gap-y-3">
        <Button
          label={t("settings.sync_now")}
          onPress={() => void sync()}
          loading={syncing || status.syncing}
          fullWidth
        />
        <Button
          label={t("settings.logout")}
          onPress={() => void endSession()}
          variant="ghost"
          disabled={syncing}
          fullWidth
        />
      </View>
    </View>
  );
}
