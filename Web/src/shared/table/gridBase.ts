export const ACTIONS_FIELD = "__actions";

export type RowTone = "muted" | "highlighted" | null;

// Every second row is shaded so the eye can follow a row across the table.
export function rowClassName(indexOnPage: number, tone: RowTone | undefined): string {
  const classes = indexOnPage % 2 === 1 ? ["row-striped"] : [];
  if (tone) classes.push(`row-${tone}`);
  return classes.join(" ");
}

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
    "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 700 },
    "& .row-striped": { bgcolor: "background.default" },
    "& .row-muted": { color: "text.disabled" },
    "& .row-highlighted": { bgcolor: "action.selected" },
    ...(autoRowHeight ? { "& .MuiDataGrid-cell": { py: 1.5 } } : {}),
  };
}
