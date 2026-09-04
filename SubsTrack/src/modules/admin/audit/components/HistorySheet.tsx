import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/authentication/auth/hooks/useAuth";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { Text } from "@/src/shared/components/Text";
import type { RecordHistoryState } from "../hooks/useRecordHistory";
import { HistoryList } from "./HistoryList";

interface HistorySheetProps {
  title: string;
  subtitle?: string | null;
  timeline: RecordHistoryState;
  onDismiss: () => void;
}

/**
 * The shell every History sheet shares: a full-height sheet, a draggable header
 * naming the record, the admin gate, and the trail itself.
 *
 * It renders a timeline but never loads one, so a new "history of X" needs only a
 * loader hook — not another sheet. Built on AppBottomSheet directly rather than
 * FormSheet: the body is a list, and FormSheet's BottomSheetScrollView cannot nest
 * one.
 */
export function HistorySheet({
  title,
  subtitle,
  timeline,
  onDismiss,
}: HistorySheetProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
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
            <Text className="text-base text-primary font-medium">
              {t("common.close")}
            </Text>
          </PressableOpacity>
        </SheetDragArea>

        {/*
          Staff can reach some of these sheets, but the audit_logs_select policy
          returns them no rows. Without this, an empty list would read as "this was
          never changed" — a false statement. Say it is restricted instead.
        */}
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
