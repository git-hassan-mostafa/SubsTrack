import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/src/modules/authentication/auth";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import type { PageHeaderIconAction } from "@/src/shared/components/PageHeader";
import { exportCsv } from "@/src/shared/lib/csv";
import { cell, fieldsOf, flattenRow, header } from "./exportRowFormat";

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

/**
 * Writes the rows a screen is ALREADY showing to a CSV, and hands back the
 * download icon for its PageHeader plus the sheet that asks which rows to take.
 *
 * The caller passes its filtered, searched list, so the file and the list can
 * never disagree. On a screen with nothing left to fetch there is no question
 * to ask and the icon exports straight away — only a paginated screen holding
 * more rows opens the two-way choice.
 *
 * The icon is `undefined` for a non-admin, so a screen spreads it
 * unconditionally and the gate stays in one place.
 */
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
  // The rows to write are read at press time, never from the render that opened
  // the sheet — `loadAll` returns a list this render has not seen yet.
  const latest = useRef(rows);
  latest.current = rows;

  const write = async (toWrite: readonly object[]): Promise<void> => {
    if (toWrite.length === 0) {
      setError(t("export.nothing_to_export"));
      return;
    }
    const flat = toWrite.map(flattenRow);
    const fields = fieldsOf(flat);
    const ok = await exportCsv(
      `${t(nameKey)}-${new Date().toISOString().slice(0, 10)}`,
      fields.map(header),
      flat.map((row) => fields.map((f) => cell(row[f]))),
    );
    if (!ok) setError(t("export.sharing_unavailable"));
  };

  const run = async (loadFirst: boolean): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await write(loadFirst && options.loadMore ? await options.loadMore.loadAll() : latest.current);
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
