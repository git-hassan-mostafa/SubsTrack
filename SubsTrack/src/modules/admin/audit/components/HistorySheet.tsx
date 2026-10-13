import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { Text } from "@/src/shared/components/Text";
import type { RecordHistoryState } from "@shared/modules/admin/audit/hooks/useRecordHistory";
import { HistoryList } from "./HistoryList";

interface HistorySheetProps {
  title: string;
  subtitle?: string | null;
  timeline: RecordHistoryState;
  onDismiss: () => void;
}

// staff read no audit rows, so they see "admins only", never a false empty trail
export function HistorySheet({
  title,
  subtitle,
  timeline,
  onDismiss,
}: HistorySheetProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  return (
    <AppBottomSheet
      visible
      onDismiss={onDismiss}
      variant="full"
      dismissOnBackdropPress={false}
    >
      <ResponsiveContainer className="flex-1">
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <View className="flex-1 pe-2">
            <Text
              fontWeight="Bold"
              className="text-lg text-gray-900"
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <PressableOpacity onPress={onDismiss}>
            <Text fontWeight="Medium" className="text-base text-primary">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </View>

        {isAdmin ? (
          <HistoryList
            inSheet
            showSubject={!subtitle}
            entries={timeline.entries}
            loading={timeline.loading}
            error={timeline.error}
            source={timeline.source}
            emptyTitle={t("audit.record_empty_title")}
            emptyDescription={t("audit.record_empty_desc")}
          />
        ) : (
          <View className="flex-1 justify-center">
            <EmptyState
              message={t("audit.admin_only_title")}
              subMessage={t("audit.admin_only_desc")}
            />
          </View>
        )}
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
