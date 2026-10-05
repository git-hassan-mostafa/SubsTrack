import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AuditTable } from "@shared/core/types";
import { useRecordHistory } from "@shared/modules/admin/audit/hooks/useRecordHistory";
import { HistorySheet } from "./HistorySheet";

interface RecordHistorySheetProps {
  table: AuditTable;
  recordId: string;
  subtitle?: string | null;
  onDismiss: () => void;
}

// One record's change timeline, the same sheet for any table (see useHistoryDoor).
export function RecordHistorySheet({
  table,
  recordId,
  subtitle,
  onDismiss,
}: RecordHistorySheetProps) {
  const { t } = useTranslation();
  const targets = useMemo(() => [{ table, recordId }], [table, recordId]);
  const timeline = useRecordHistory(targets);

  return (
    <HistorySheet
      title={t("audit.record_history_title")}
      subtitle={subtitle}
      timeline={timeline}
      onDismiss={onDismiss}
    />
  );
}
