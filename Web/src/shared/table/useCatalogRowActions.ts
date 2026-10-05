import { useTranslation } from "react-i18next";
import {
  catalogRowActions,
  catalogSelectionActions,
  type CatalogActionKey,
  type CatalogKind,
} from "@shared/shared/lib/catalogMenu";
import { confirm } from "@shared/shared/lib/confirm";
import { CATALOG_ACTION_ICONS } from "./catalogActionIcons";
import { toTableActions, type TableAction } from "./tableAction";

type Doors = Partial<Record<CatalogActionKey, () => void>>;

export interface CatalogRowActionsConfig<T extends { id: string }> {
  kind: CatalogKind;
  textKeys: string;
  nameValues: (row: T) => Record<string, string>;
  remove: (id: string) => Promise<"hard" | "soft" | boolean | null>;
  removeMany: (ids: string[]) => Promise<boolean>;
  deactivate?: (id: string) => Promise<T | null>;
  reactivate?: (id: string) => Promise<T | null>;
  patchRow: (row: T) => void;
  reload: () => void;
  doors: (row: T) => Doors;
}

export interface CatalogRowActions<T> {
  rowActions: (row: T) => TableAction[];
  bulkActions: (selected: T[]) => TableAction[];
}

// Every catalog table's row + selection menu; `textKeys` names the i18n group.
export function useCatalogRowActions<T extends { id: string }>(
  config: CatalogRowActionsConfig<T>,
): CatalogRowActions<T> {
  const { t } = useTranslation();
  const { kind, textKeys, nameValues, patchRow, reload } = config;

  const patchAfter = async (write: Promise<T | null>) => {
    const updated = await write;
    if (updated) patchRow(updated);
  };

  const confirmDeactivate = (row: T, deactivate: (id: string) => Promise<T | null>) =>
    confirm({
      title: t(`${textKeys}.deactivate_title`),
      message: t(`${textKeys}.deactivate_message`, nameValues(row)),
      destructive: true,
      onConfirm: () => patchAfter(deactivate(row.id)),
    });

  const confirmDelete = (rows: T[]) => {
    const single = rows.length === 1 ? rows[0] : null;
    return confirm({
      title: single
        ? t(`${textKeys}.delete_title`)
        : t(`${textKeys}.bulk_delete_title`, { count: rows.length }),
      message: single
        ? t(`${textKeys}.delete_message`, nameValues(single))
        : t(`${textKeys}.bulk_delete_message`, { count: rows.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        const done = single
          ? Boolean(await config.remove(single.id))
          : await config.removeMany(rows.map((row) => row.id));
        if (done) reload();
      },
    });
  };

  const runFor = (row: T): Doors => {
    const { deactivate, reactivate } = config;
    return {
      ...config.doors(row),
      deactivate: deactivate ? () => void confirmDeactivate(row, deactivate) : undefined,
      reactivate: reactivate ? () => void patchAfter(reactivate(row.id)) : undefined,
    };
  };

  return {
    rowActions: (row) =>
      toTableActions(catalogRowActions(kind, row), t, {
        icons: CATALOG_ACTION_ICONS,
        run: { ...runFor(row), delete: () => void confirmDelete([row]) },
      }),
    bulkActions: (selected) =>
      toTableActions(catalogSelectionActions(kind, selected), t, {
        icons: CATALOG_ACTION_ICONS,
        run: {
          ...(selected.length === 1 ? runFor(selected[0]) : {}),
          delete: () => void confirmDelete(selected),
        },
      }),
  };
}
