import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  useAppDownloadUrl,
  useOptionSlice,
} from "@shared/state/hooks/useOptionSlice";
import { downloadUpdate, useAppUpdate } from "@/src/shared/hooks/useAppUpdate";
import { openUrl } from "@/src/shared/lib/openUrl";
import { Button } from "./Button";
import { ErrorBanner } from "./ErrorBanner";
import { Text } from "./Text";

// Covers the app instead of replacing <Slot />, so the router stays mounted.
export function UpdateRequiredScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fetchOptions = useOptionSlice((s) => s.fetchOptions);
  const downloadUrl = useAppDownloadUrl();
  const { updateReady, apply } = useAppUpdate();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  async function handleUpdate() {
    if (updateReady) return apply();
    setError(null);
    setWorking(true);
    if (await downloadUpdate()) return apply();
    setWorking(false);
    if (!downloadUrl || !(await openUrl(downloadUrl))) {
      setError(t("update_required.not_found"));
    }
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}
      className="bg-white px-5 justify-center"
    >
      <Text fontWeight="SemiBold" className="text-xl text-gray-900 mb-2">
        {t("update_required.title")}
      </Text>
      <Text className="text-base text-gray-500 mb-6">
        {t("update_required.message")}
      </Text>
      {error ? (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      ) : null}
      <Button
        label={t("update_required.update")}
        onPress={() => void handleUpdate()}
        loading={working}
        fullWidth
      />
    </View>
  );
}
