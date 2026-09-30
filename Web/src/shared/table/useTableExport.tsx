import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import CloudDownloadOutlined from "@mui/icons-material/CloudDownloadOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { toExportTable } from "@shared/shared/hooks/exportRowFormat";
import { downloadCsv } from "@/shared/lib/downloadCsv";

export interface TableExport<T extends object = object> {
  nameKey: string;
  loadAll: () => Promise<readonly T[]>;
  record?: (row: T) => object;
}

// Admin-only like the phone; asks "this page or all" only when there is more.
export function useTableExport<T extends object>(
  config: TableExport<T> | undefined,
  pageRows: readonly T[],
  total: number,
) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuId = useId();

  if (!config || !isAdmin) {
    return { button: null, error: null, clearError: () => setError(null) };
  }

  const run = async (all: boolean) => {
    setAnchor(null);
    setError(null);
    setBusy(true);
    try {
      const rows = all ? await config.loadAll() : pageRows;
      const records = config.record ? rows.map(config.record) : rows;
      if (records.length === 0) {
        setError(t("export.nothing_to_export"));
        return;
      }
      const day = new Date().toISOString().slice(0, 10);
      downloadCsv(`${t(config.nameKey)}-${day}`, toExportTable(records));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = t("export.export_to_excel");
  const hasMore = total > pageRows.length;

  const button = (
    <>
      <Tooltip title={label}>
        <span>
          <IconButton
            aria-label={label}
            aria-haspopup={hasMore ? "menu" : undefined}
            aria-controls={anchor ? menuId : undefined}
            disabled={busy}
            onClick={(event) =>
              hasMore ? setAnchor(event.currentTarget) : void run(false)
            }
          >
            <FileDownloadOutlined />
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
      >
        <MenuItem onClick={() => void run(false)}>
          <ListItemIcon>
            <VisibilityOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {t("web.table.export_this_page", { count: pageRows.length })}
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void run(true)}>
          <ListItemIcon>
            <CloudDownloadOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText secondary={t("export.everything_hint")}>
            {t("web.table.export_all", { count: total })}
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );

  return { button, error, clearError: () => setError(null) };
}
