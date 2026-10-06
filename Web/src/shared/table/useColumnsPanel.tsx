import { useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ViewColumnOutlined from "@mui/icons-material/ViewColumnOutlined";
import { GridPreferencePanelsValue, useGridApiRef } from "@mui/x-data-grid";

// The grid's own Columns panel, opened from our toolbar; pointer-up must not count as a click-away.
export function useColumnsPanel() {
  const { t } = useTranslation();
  const apiRef = useGridApiRef();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const label = t("web.table.columns");

  const toggle = () => {
    if (open) apiRef.current?.hidePreferences();
    else apiRef.current?.showPreferences(GridPreferencePanelsValue.columns);
  };

  const button = (
    <Tooltip title={label}>
      <IconButton
        ref={setAnchor}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onPointerUp={(event) => {
          if (open) event.stopPropagation();
        }}
        onClick={toggle}
      >
        <ViewColumnOutlined />
      </IconButton>
    </Tooltip>
  );

  return {
    button,
    apiRef,
    panelTarget: anchor,
    onPreferencePanelOpen: () => setOpen(true),
    onPreferencePanelClose: () => setOpen(false),
  };
}
