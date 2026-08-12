import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AuditTable } from "@/src/core/types";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { RecordHistorySheet } from "../components/RecordHistorySheet";

interface RecordHistoryAction {
  /** The "History" row for one record's 3-dot menu. */
  action: (recordId: string, name?: string | null) => ActionMenuItem;
  /** Render once in the screen — the sheet the row opens (null while closed). */
  sheet: ReactNode;
}

/**
 * "History" for any audited list: one call gives a screen the menu row AND the sheet
 * it opens, so products / plans / staff / branches / currencies all offer the same
 * trail without each screen keeping its own open-record state.
 *
 * The row is offered to every role — a non-admin's read returns no rows, and the
 * sheet says "Admins only" rather than showing an empty (and untrue) timeline.
 */
export function useRecordHistoryAction(table: AuditTable): RecordHistoryAction {
  const { t } = useTranslation();
  const [target, setTarget] = useState<{
    id: string;
    name?: string | null;
  } | null>(null);

  return {
    action: (recordId, name) => ({
      key: "history",
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
