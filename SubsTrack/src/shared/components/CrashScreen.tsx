import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { CrashReport } from "@/src/core/errorLog/crashStore";
import { copyText } from "@/src/shared/lib/clipboard";
import { Button } from "./Button";
import { Text } from "./Text";

interface Props {
  report: CrashReport;
  onRetry: () => void;
}

function detailsOf(report: CrashReport): string {
  return [report.stack, report.context].filter(Boolean).join("\n\n");
}

export function CrashScreen({ report, onRetry }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const details = detailsOf(report);

  const copy = async () => {
    setCopied(await copyText(`${report.message}\n\n${details}`));
  };

  return (
    <View
      className="flex-1 bg-white px-5"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}
    >
      <Text fontWeight="SemiBold" className="text-xl text-gray-900 mb-1">
        {t("common.something_went_wrong")}
      </Text>
      <Text className="text-sm text-gray-500 mb-4">
        {t("common.crash_hint")}
      </Text>
      <Text selectable fontWeight="SemiBold" className="text-sm text-danger mb-2">
        {report.message}
      </Text>
      <ScrollView
        className="flex-1 rounded-lg border border-gray-200 bg-gray-50"
        contentContainerClassName="p-3"
      >
        <Text selectable className="text-xs text-gray-800">
          {details}
        </Text>
      </ScrollView>
      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          <Button
            label={copied ? t("common.copied") : t("common.copy")}
            variant="ghost"
            onPress={() => void copy()}
            fullWidth
          />
        </View>
        <View className="flex-1">
          <Button label={t("common.try_again")} onPress={onRetry} fullWidth />
        </View>
      </View>
    </View>
  );
}
