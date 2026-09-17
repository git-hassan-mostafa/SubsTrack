import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AuditTable } from "@/src/core/types";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { RecordHistorySheet } from "../components/RecordHistorySheet";

interface RecordHistoryAction {
  action: (recordId: string, name?: string | null) => ActionMenuItem;
  sheet: ReactNode;
}

// Offered to every role: a non-admin's read is empty and the sheet says so.
export function useRecordHistoryAction(table: AuditTable): RecordHistoryAction {
  const { t } = useTranslation();
  const [target, setTarget] = useState<{
    id: string;
    name?: string | null;
  } | null>(null);

  return {
    action: (recordId, name) => ({
      key: "history",
      group: "history",
      label: t("audit.history"),
      icon: "time-outline",
      onPress: () => setTarget({ id: recordId, name }),
    }),
    sheet: target ? (
      <RecordHistorySheet
        table={table}
        recordId={target.id}
        subtitle={target.name}
        onDismiss={() => setTarget(null)}
      />
    ) : null,
  };
}
