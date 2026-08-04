import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import type { AuditEntry } from "@/src/core/types";
import { COLORS } from "@/src/shared/constants";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useAuditSlice } from "@/src/state/hooks/useAuditSlice";
import { AuditEntryCard } from "./AuditEntryCard";
import { AuditEntrySheet } from "./AuditEntrySheet";

interface RecordHistorySheetProps {
  /** The audited table the record belongs to, e.g. 'payments'. */
  table: string;
  recordId: string;
  onDismiss: () => void;
}

/**
 * One record's change timeline. Opened from a record's detail sheet, so admins can
 * answer "who touched THIS payment" without filtering the whole log.
 *
 * Built on AppBottomSheet directly rather than FormSheet: the body is a list, and
 * FormSheet's BottomSheetScrollView cannot nest one.
 */
export function RecordHistorySheet({ table, recordId, onDismiss }: RecordHistorySheetProps) {
  const { t } = useTranslation();
  const items = useAuditSlice((s) => s.recordItems);
  const loading = useAuditSlice((s) => s.recordLoading);
  const error = useAuditSlice((s) => s.recordError);
  const fetchRecordHistory = useAuditSlice((s) => s.fetchRecordHistory);
  const clearRecordHistory = useAuditSlice((s) => s.clearRecordHistory);

  // Starts on the local 30-day window; the button re-fetches from the server.
  const [full, setFull] = useState(false);
  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);

  useEffect(() => {
    void fetchRecordHistory(table, recordId, full);
  }, [fetchRecordHistory, table, recordId, full]);

  function dismiss() {
    clearRecordHistory();
    onDismiss();
  }

  return (
    <AppBottomSheet visible onDismiss={dismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text
            fontWeight="Bold"
            className="text-lg text-gray-900 flex-1 pe-2"
            numberOfLines={1}
          >
            {t("audit.record_history_title")}
          </Text>
          <PressableOpacity onPress={dismiss}>
            <Text className="text-base text-primary font-medium">{t("common.close")}</Text>
          </PressableOpacity>
        </SheetDragArea>

        {error ? <ErrorBanner message={error} /> : null}

        {loading && items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <BottomSheetFlatList
            data={items}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <AuditEntryCard entry={item} onPress={() => setOpenEntry(item)} />
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 48, flexGrow: 1 }}
            ListHeaderComponent={
              <ScopeNote full={full} onLoadFull={() => setFull(true)} />
            }
            ListEmptyComponent={
              <EmptyState
                message={t("audit.record_empty_title")}
                subMessage={t("audit.record_empty_desc")}
              />
            }
          />
        )}
      </ResponsiveContainer>

      {openEntry ? (
        <AuditEntrySheet entry={openEntry} onDismiss={() => setOpenEntry(null)} />
      ) : null}
    </AppBottomSheet>
  );
}

/** Explains that the list is a 30-day window, and offers the full server history. */
function ScopeNote({ full, onLoadFull }: { full: boolean; onLoadFull: () => void }) {
  const { t } = useTranslation();
  if (full) {
    return <Text className="text-xs text-gray-400 mb-3">{t("audit.showing_full")}</Text>;
  }
  return (
    <View className="mb-3">
      <Text className="text-xs text-gray-400">{t("audit.local_window_note")}</Text>
      <PressableOpacity onPress={onLoadFull} className="mt-1">
        <Text className="text-xs text-primary font-medium">{t("audit.load_full")}</Text>
      </PressableOpacity>
    </View>
  );
}
