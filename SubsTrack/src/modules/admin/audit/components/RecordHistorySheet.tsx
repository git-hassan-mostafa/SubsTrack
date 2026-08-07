import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AuditTable } from "@/src/core/types";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useRecordHistory } from "../hooks/useRecordHistory";
import { HistoryList } from "./HistoryList";

interface RecordHistorySheetProps {
  /** The audited table the record belongs to, e.g. 'payments'. */
  table: AuditTable;
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
  // Local to this sheet, so closing it needs no cleanup and two open sheets can't
  // overwrite each other's entries.
  const targets = useMemo(() => [{ table, recordId }], [table, recordId]);
  const { entries, loading, error, source } = useRecordHistory(targets);

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text
            fontWeight="Bold"
            className="text-lg text-gray-900 flex-1 pe-2"
            numberOfLines={1}
          >
            {t("audit.record_history_title")}
          </Text>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">{t("common.close")}</Text>
          </PressableOpacity>
        </SheetDragArea>

        <HistoryList
          inSheet
          entries={entries}
          loading={loading}
          error={error}
          source={source}
          emptyTitle={t("audit.record_empty_title")}
          emptyDescription={t("audit.record_empty_desc")}
        />
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
