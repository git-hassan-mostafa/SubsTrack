import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AuditTable } from "@/src/core/types";
import { useRecordHistory } from "../hooks/useRecordHistory";
import { HistorySheet } from "./HistorySheet";

interface RecordHistorySheetProps {
  table: AuditTable;
  recordId: string;
  subtitle?: string | null;
  onDismiss: () => void;
}

/**
 * One record's change timeline — the SAME sheet for a payment, a product, a plan, a
 * branch or a staff member, so any list can offer "History" from its 3-dot menu
 * (see useRecordHistoryAction) without building a view of its own.
 *
 * Opened from a record's detail sheet or card menu, so admins can answer "who
 * touched THIS row" without filtering the whole log.
 */
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
