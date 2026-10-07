import { useState, type ReactNode } from "react";
import type { AuditTable } from "@shared/core/types";
import { RecordHistoryDialog } from "../components/RecordHistoryDialog";

interface HistoryDoor {
  open: (recordId: string, name?: string | null) => void;
  dialog: ReactNode;
}

// The "History" door any table offers, plus the dialog it opens.
export function useHistoryDoor(table: AuditTable): HistoryDoor {
  const [target, setTarget] = useState<{ id: string; name?: string | null } | null>(null);

  return {
    open: (recordId, name) => setTarget({ id: recordId, name }),
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
