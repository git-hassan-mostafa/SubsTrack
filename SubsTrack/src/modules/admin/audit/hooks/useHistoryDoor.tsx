import { useState, type ReactNode } from "react";
import type { AuditTable } from "@shared/core/types";
import { RecordHistorySheet } from "../components/RecordHistorySheet";

interface HistoryDoor {
  open: (recordId: string, name?: string | null) => void;
  sheet: ReactNode;
}

// Offered to every role: a non-admin's read is empty and the sheet says so.
export function useHistoryDoor(table: AuditTable): HistoryDoor {
  const [target, setTarget] = useState<{
    id: string;
    name?: string | null;
  } | null>(null);

  return {
    open: (recordId, name) => setTarget({ id: recordId, name }),
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
