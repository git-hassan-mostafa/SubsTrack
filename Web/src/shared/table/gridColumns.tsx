import { useCallback, useMemo } from "react";
import type {
  GridColDef,
  GridColumnResizeParams,
  GridColumnVisibilityModel,
  GridRenderCellParams,
  GridValidRowModel,
} from "@mui/x-data-grid";
import { CellText } from "./CellText";
import { EMPTY_VIEW, useTableView } from "./tableViews";

function renderText(params: GridRenderCellParams) {
  const text = params.formattedValue?.toString() ?? "";
  return text === "" ? null : <CellText text={text} />;
}

// Widths and hidden columns live outside the grid, so a rebuilt `columns` array can't reset them.
export function useGridColumns<T extends GridValidRowModel>(columns: GridColDef<T>[], viewKey: string | null) {
  const { view, updateView } = useTableView(viewKey);

  const gridColumns = useMemo<GridColDef<T>[]>(
    () =>
      columns.map((column) => ({
        ...column,
        display: column.display ?? "flex",
        renderCell: column.renderCell ?? renderText,
        ...(view.widths[column.field] === undefined ? {} : { width: view.widths[column.field], flex: 0 }),
      })),
    [columns, view.widths],
  );

  const onColumnWidthChange = useCallback(
    (params: GridColumnResizeParams) =>
      updateView((held) => ({ ...held, widths: { ...held.widths, [params.colDef.field]: params.width } })),
    [updateView],
  );

  const onColumnVisibilityModelChange = useCallback(
    (hidden: GridColumnVisibilityModel) => updateView((held) => ({ ...held, hidden })),
    [updateView],
  );

  const resetColumns = useCallback(() => updateView(() => EMPTY_VIEW), [updateView]);

  return {
    gridProps: {
      columns: gridColumns,
      onColumnWidthChange,
      columnVisibilityModel: view.hidden,
      onColumnVisibilityModelChange,
    },
    resetColumns,
  };
}
