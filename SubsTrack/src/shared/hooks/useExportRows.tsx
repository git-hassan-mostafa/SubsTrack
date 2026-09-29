import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { PageHeaderIconAction } from "@/src/shared/components/PageHeader";
import { exportCsv } from "@/src/shared/lib/exportCsv";
import { toExportTable } from "@shared/shared/hooks/exportRowFormat";

// What a paginated screen tells the hook so it can offer the second choice.
// `loadAll` keeps fetching pages until `hasMore` goes false; the hook only ever
// asks when there is genuinely more to fetch.
export interface ExportLoadAll {
  hasMore: boolean;
  loadAll: () => Promise<readonly object[]>;
  // Named for the widest thing the screen CAN export — a trail with no natural
  // end says "this month", not "everything", because that is what it will send.
  allLabelKey?: string;
  allHintKey?: string;
}

interface Options {
  loadMore?: ExportLoadAll;
}

// Exports the rows on screen; asks "these or all" only when more pages exist.
export function useExportRows(
  nameKey: string,
  rows: readonly object[],
  options: Options = {},
) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const rowsAtPress = useRef(rows);
  rowsAtPress.current = rows;

  const write = async (toWrite: readonly object[]): Promise<void> => {
    if (toWrite.length === 0) {
      setError(t("export.nothing_to_export"));
      return;
    }
    const table = toExportTable(toWrite);
    const ok = await exportCsv(
      `${t(nameKey)}-${new Date().toISOString().slice(0, 10)}`,
      table.headers,
      table.rows,
    );
    if (!ok) setError(t("export.sharing_unavailable"));
  };

  const run = async (loadFirst: boolean): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await write(
        loadFirst && options.loadMore
          ? await options.loadMore.loadAll()
          : rowsAtPress.current,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canAsk = Boolean(options.loadMore?.hasMore);

  const actions: ActionMenuItem[] = [
    {
      key: "view",
      label: t("export.only_this_view", { count: rows.length }),
      icon: "eye-outline",
      onPress: () => void run(false),
    },
    {
      key: "all",
      label: t(options.loadMore?.allLabelKey ?? "export.everything"),
      icon: "cloud-download-outline",
      caption: t(options.loadMore?.allHintKey ?? "export.everything_hint"),
      onPress: () => void run(true),
    },
  ];

  const iconAction: PageHeaderIconAction | undefined =
    isAdmin && !busy
      ? {
          key: "export",
          icon: "download-outline",
          label: t("export.export_to_excel"),
          onPress: () => (canAsk ? setAsking(true) : void run(false)),
        }
      : undefined;

  return {
    iconActions: iconAction ? [iconAction] : undefined,
    exportError: error,
    clearExportError: () => setError(null),
    exporting: busy,
    exportSheet: (
      <ActionMenu
        visible={asking}
        title={t("export.export_to_excel")}
        actions={actions}
        onDismiss={() => setAsking(false)}
      />
    ),
  };
}
