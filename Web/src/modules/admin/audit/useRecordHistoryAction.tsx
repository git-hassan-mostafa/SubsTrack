import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import type { AuditTable } from "@shared/core/types";
import type { TableAction } from "@/shared/table/tableAction";
import { RecordHistoryDialog } from "./RecordHistoryDialog";

interface RecordHistoryAction {
  action: (recordId: string, name?: string | null) => TableAction;
  dialog: ReactNode;
}

// The "History" row action any table offers, plus the dialog it opens.
export function useRecordHistoryAction(table: AuditTable): RecordHistoryAction {
  const { t } = useTranslation();
  const [target, setTarget] = useState<{ id: string; name?: string | null } | null>(null);

  return {
    action: (recordId, name) => ({
      key: "history",
      group: "history",
      label: t("audit.history"),
      icon: HistoryOutlined,
      onClick: () => setTarget({ id: recordId, name }),
    }),
    dialog: target ? (
      <RecordHistoryDialog
        table={table}
        recordId={target.id}
        name={target.name}
        onClose={() => setTarget(null)}
      />
    ) : null,
  };
}
