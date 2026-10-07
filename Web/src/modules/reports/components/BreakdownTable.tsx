import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import Paper from "@mui/material/Paper";
import CallSplitOutlined from "@mui/icons-material/CallSplitOutlined";
import ListAltOutlined from "@mui/icons-material/ListAltOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import { formatMoney } from "@shared/core/utils/currency";
import { NO_KEY, type ReportGroup } from "@shared/modules/reports/utils/analysis";
import {
  DIMENSION_LABEL_KEY,
  type ReportDimension,
} from "@shared/modules/reports/utils/reportDimensions";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { EmptyState } from "@/shared/components/EmptyState";
import { MoneyText } from "@/shared/components/MoneyText";
import { ShareBar } from "@/shared/components/ShareBar";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";

export type GroupRow<R> = ReportGroup<R> & { id: string };

interface BreakdownTableProps<R> {
  title: string;
  groups: ReportGroup<R>[];
  dim: ReportDimension;
  label: (key: string) => string;
  measure: "money" | "count";
  countHeader: string;
  valueHeader?: string;
  hideValue?: boolean;
  extraColumns?: GridColDef<GroupRow<R>>[];
  splitDims?: readonly ReportDimension[];
  onShowRecords?: (group: ReportGroup<R>) => void;
  onSplit?: (group: ReportGroup<R>, next: ReportDimension) => void;
}

export function BreakdownTable<R>({
  title,
  groups,
  dim,
  label,
  measure,
  countHeader,
  valueHeader,
  hideValue = false,
  extraColumns = [],
  splitDims = [],
  onShowRecords,
  onSplit,
}: BreakdownTableProps<R>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const display = useDisplayCurrency();
  const rows = useMemo<GroupRow<R>[]>(() => groups.map((g) => ({ ...g, id: g.key })), [groups]);

  const rowLabel = useCallback((row: GroupRow<R>) => label(row.key), [label]);

  const rowActions = useCallback(
    (row: GroupRow<R>): TableAction[] => {
      const actions: TableAction[] = [];
      if (onShowRecords && row.count > 0) {
        actions.push({
          key: "records",
          group: "open",
          label: t("web.reports.show_records"),
          icon: ListAltOutlined,
          onClick: () => onShowRecords(row),
        });
      }
      if (dim === "customer" && row.key !== NO_KEY) {
        actions.push({
          key: "customer",
          group: "open",
          label: t("web.reports.open_customer"),
          icon: PersonOutlined,
          onClick: () => void navigate(`/customers/${row.key}`),
        });
      }
      if (onSplit && row.count > 0) {
        for (const next of splitDims) {
          actions.push({
            key: `split:${next}`,
            group: "manage",
            label: t("web.reports.split_by", {
              name: label(row.key),
              by: t(`web.reports.by_${next}`),
            }),
            icon: CallSplitOutlined,
            onClick: () => onSplit(row, next),
          });
        }
      }
      return actions;
    },
    [dim, label, navigate, onShowRecords, onSplit, splitDims, t],
  );

  const columns = useMemo<GridColDef<GroupRow<R>>[]>(() => {
    const valueColumn: GridColDef<GroupRow<R>> = {
      field: "value",
      headerName: valueHeader ?? t("reports.col_amount"),
      width: 170,
      renderCell: (params) =>
        measure === "money" ? (
          <MoneyText primary={formatMoney(params.row.value, null, display)} />
        ) : (
          params.row.value
        ),
    };
    return [
      {
        field: "key",
        headerName: t(DIMENSION_LABEL_KEY[dim]),
        flex: 1.4,
        minWidth: 200,
        renderCell: (params) =>
          onShowRecords && params.row.count > 0 ? (
            <RowLink
              label={label(params.row.key)}
              tabIndex={params.tabIndex}
              onClick={() => onShowRecords(params.row)}
            />
          ) : (
            label(params.row.key)
          ),
      },
      ...extraColumns,
      {
        field: "count",
        headerName: countHeader,
        width: 130,
      },
      ...(hideValue ? [] : [valueColumn]),
      {
        field: "share",
        headerName: t("web.reports.share"),
        flex: 1,
        minWidth: 180,
        renderCell: (params) => <ShareBar share={params.row.share} />,
      },
    ];
  }, [countHeader, dim, display, extraColumns, hideValue, label, measure, onShowRecords, t, valueHeader]);

  if (rows.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState title={t("reports.empty")} hint={t("reports.empty_hint")} />
      </Paper>
    );
  }

  return (
    <LocalTable<GroupRow<R>>
      label={title}
      columns={columns}
      rows={rows}
      rowLabel={rowLabel}
      rowActions={onShowRecords || onSplit || dim === "customer" ? rowActions : undefined}
    />
  );
}
