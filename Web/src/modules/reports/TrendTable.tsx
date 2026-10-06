import { useMemo } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { ShareBar } from "@/shared/components/ShareBar";
import { LocalTable } from "@/shared/table/LocalTable";

export interface TrendSeries<T> {
  field: string;
  header: string;
  valueOf: (row: T) => number;
  format: (value: number) => string;
  color?: string;
}

interface TrendTableProps<T extends { key: string }> {
  label: string;
  rows: T[];
  bucketLabel: (key: string) => string;
  bucketHeader: string;
  series: TrendSeries<T>[];
}

// Each bar is scaled to the largest value in the whole table, so rows compare at a glance.
export function TrendTable<T extends { key: string }>({
  label,
  rows,
  bucketLabel,
  bucketHeader,
  series,
}: TrendTableProps<T>) {
  const gridRows = useMemo(() => rows.map((row) => ({ ...row, id: row.key })), [rows]);
  const peak = useMemo(
    () =>
      Math.max(
        0,
        ...rows.flatMap((row) => series.filter((s) => s.color).map((s) => Math.abs(s.valueOf(row)))),
      ),
    [rows, series],
  );

  const columns = useMemo<GridColDef<T & { id: string }>[]>(
    () => [
      {
        field: "key",
        headerName: bucketHeader,
        width: 160,
        valueGetter: (_value, row) => bucketLabel(row.key),
      },
      ...series.map(
        (s): GridColDef<T & { id: string }> => ({
          field: s.field,
          headerName: s.header,
          flex: s.color ? 1 : undefined,
          width: s.color ? undefined : 150,
          minWidth: s.color ? 220 : undefined,
          align: s.color ? "left" : "right",
          headerAlign: s.color ? "left" : "right",
          renderCell: (params) => {
            const value = s.valueOf(params.row);
            if (!s.color) return s.format(value);
            return (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", height: "100%" }}>
                <Typography variant="body2" sx={{ minWidth: 110, fontWeight: 600 }}>
                  {s.format(value)}
                </Typography>
                <ShareBar share={peak === 0 ? 0 : Math.abs(value) / peak} color={s.color} showPercent={false} />
              </Stack>
            );
          },
        }),
      ),
    ],
    [bucketHeader, bucketLabel, peak, series],
  );

  return <LocalTable label={label} columns={columns} rows={gridRows} />;
}
