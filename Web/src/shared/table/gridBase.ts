export const ACTIONS_FIELD = "__actions";
export const AUTO_ROW_HEIGHT = () => "auto" as const;

export const LOCKED_GRID = {
  disableColumnSorting: true,
  disableColumnMenu: true,
  disableColumnFilter: true,
  disableColumnSelector: true,
  disableColumnResize: true,
  autoHeight: true,
} as const;

// Every web grid, page or dialog, draws its rows the same way.
export function gridSx(autoRowHeight: boolean) {
  return {
    bgcolor: "background.paper",
    "--DataGrid-overlayHeight": "160px",
    "& .row-muted": { color: "text.disabled" },
    "& .row-highlighted": { bgcolor: "action.selected" },
    ...(autoRowHeight ? { "& .MuiDataGrid-cell": { py: 1.5 } } : {}),
  };
}
