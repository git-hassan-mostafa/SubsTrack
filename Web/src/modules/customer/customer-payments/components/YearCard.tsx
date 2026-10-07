import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import type { MonthEntry } from "@shared/core/types";
import type { CustomerMonthGrid } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";
import { lineLabel } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { BulkActionBar } from "@/shared/table/BulkActionBar";
import type { TableAction } from "@/shared/table/tableAction";
import { MonthGrid } from "./MonthGrid";
import { MONTH_SELECTION_ICONS } from "../utils/monthGridIcons";
import { MonthsTable } from "./MonthsTable";

type MonthsView = "list" | "grid";

interface YearCardProps {
  grid: CustomerMonthGrid;
  menuActions: (entry: MonthEntry) => TableAction[];
}

// The viewed year of one service line; the year arrows never re-read (#121).
export function YearCard({ grid, menuActions }: YearCardProps) {
  const { t } = useTranslation();
  const { selection, selectedLine, year, summary } = grid;
  const [view, setView] = useState<MonthsView>("grid");

  const selectionActions: TableAction[] = selection.items.map((item) => ({
    key: item.key,
    group: item.group,
    label: t(item.labelKey),
    icon: MONTH_SELECTION_ICONS[item.key],
    disabled: selection.busy,
    onClick: () => selection.run(item.key),
  }));

  const changeView = (next: MonthsView | null) => {
    if (next) setView(next);
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Tooltip title={t("web.month_grid.previous_year")}>
              <span>
                <IconButton
                  aria-label={t("web.month_grid.previous_year")}
                  disabled={year <= grid.minYear}
                  onClick={() => grid.stepYear(-1)}
                >
                  <ChevronLeft />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700, minWidth: 56, textAlign: "center" }}>
              {year}
            </Typography>
            <Tooltip title={t("web.month_grid.next_year")}>
              <IconButton aria-label={t("web.month_grid.next_year")} onClick={() => grid.stepYear(1)}>
                <ChevronRight />
              </IconButton>
            </Tooltip>
          </Stack>
          {selectedLine ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {lineLabel(selectedLine, t("common.no_plan"))}
                {selectedLine.active ? "" : ` · ${t("subscriptions.cancelled")}`}
              </Typography>
              {grid.priceLabel ? (
                <Typography variant="body2" color="text.secondary" noWrap>
                  · {grid.priceLabel}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
          <Stack direction="row" spacing={3} component="dl" sx={{ m: 0 }}>
            <SummaryFigure label={t("customers.year_paid")} value={String(summary.paid)} />
            <SummaryFigure label={t("customers.year_unpaid")} value={String(summary.unpaid)} />
            {summary.skipped > 0 ? (
              <SummaryFigure label={t("payments.skip.skipped_label")} value={String(summary.skipped)} />
            ) : null}
            <SummaryFigure label={t("customers.year_collected")} value={grid.collectedLabel} />
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_event, next: MonthsView | null) => changeView(next)}
            aria-label={t("web.month_grid.view_label")}
          >
            <Tooltip title={t("web.month_grid.view_list")}>
              <ToggleButton value="list" aria-label={t("web.month_grid.view_list")}>
                <ViewListOutlined fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip title={t("web.month_grid.view_grid")}>
              <ToggleButton value="grid" aria-label={t("web.month_grid.view_grid")}>
                <GridViewOutlined fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Stack>
      </Paper>
      {selection.count > 0 ? (
        <BulkActionBar count={selection.count} actions={selectionActions} onClear={selection.clear} />
      ) : null}
      {grid.gridPending ? (
        <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : view === "list" ? (
        <MonthsTable grid={grid} menuActions={menuActions} />
      ) : (
        <MonthGrid
          months={grid.grid}
          isRegular={grid.isRegular}
          busyMonth={grid.busyMonth}
          isSelected={selection.isSelected}
          menuActions={menuActions}
          onOpen={grid.tap}
          onToggle={selection.toggle}
        />
      )}
    </Stack>
  );
}

function SummaryFigure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" sx={{ m: 0, fontWeight: 700 }}>
        {value}
      </Typography>
    </Box>
  );
}
