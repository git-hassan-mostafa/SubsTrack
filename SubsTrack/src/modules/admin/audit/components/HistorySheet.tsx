import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetHeader } from "@/src/shared/components/SheetHeader";
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
        <SheetHeader title={title} subtitle={subtitle} onClose={onDismiss} />

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
