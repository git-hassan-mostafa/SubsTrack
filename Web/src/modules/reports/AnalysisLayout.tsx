import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useReportView } from "@shared/modules/reports/hooks/useReportView";
import type { ReportGroup } from "@shared/modules/reports/utils/analysis";
import type { ReportKpi } from "@shared/modules/reports/utils/reportKpis";
import {
  DIMENSION_LABEL_KEY,
  type ReportDimension,
} from "@shared/modules/reports/utils/reportDimensions";
import { splitTargets, type ReportSection } from "@shared/modules/reports/utils/reportSections";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";
import type { RecordRow } from "@shared/modules/reports/utils/types";
import { CsvButton } from "@/shared/components/CsvButton";
import { PanelSection } from "@/shared/components/PanelSection";
import { GroupByControls, ReportFilters } from "./AnalysisControls";
import { groupsCsv } from "@shared/modules/reports/utils/csvRows";
import { BreakdownTable, type GroupRow } from "./BreakdownTable";
import { KpiGrid } from "./KpiGrid";
import { RecordsDialog, type RecordsDrill } from "./RecordsDialog";
import { useSectionTools } from "./useSectionTools";

interface AnalysisLayoutProps<R> {
  section: ReportSection;
  kpis: ReportKpi[];
  filters: readonly ReportDimension[];
  dims: readonly ReportDimension[];
  options: Partial<Record<ReportDimension, string[]>>;
  names: ReadonlyMap<string, string>;
  grain: TimeGrain;
  groups: ReportGroup<R>[];
  measure: "money" | "count";
  countHeader: string;
  valueHeader?: string;
  hideValue?: boolean;
  kpiNote?: string | null;
  extraColumns?: GridColDef<GroupRow<R>>[];
  toRecords?: (rows: R[]) => RecordRow[];
  recordsNote?: string;
  onShowGroup?: (group: ReportGroup<R>) => void;
  children?: ReactNode;
}

// Overview first, then narrow and split, then the rows on demand.
export function AnalysisLayout<R>({
  section,
  kpis,
  filters,
  dims,
  options,
  names,
  grain,
  groups,
  measure,
  countHeader,
  valueHeader,
  hideValue,
  kpiNote,
  extraColumns,
  toRecords,
  recordsNote,
  onShowGroup,
  children,
}: AnalysisLayoutProps<R>) {
  const { t } = useTranslation();
  const { view, setFilter, clearFilters, setGroupBy, setGrain, drillInto } = useReportView(section);
  const { label, fileName } = useSectionTools(section, grain, names);
  const [drill, setDrill] = useState<RecordsDrill | null>(null);
  const dim = view.groupBy;
  const dimLabel = t(DIMENSION_LABEL_KEY[dim]);
  const groupLabel = (key: string) => label(dim, key);
  const title = t("web.reports.split_title", { dim: dimLabel });

  const showGroup =
    onShowGroup ??
    (toRecords
      ? (group: ReportGroup<R>) =>
          setDrill({
            title: groupLabel(group.key),
            subtitle: dimLabel,
            note: recordsNote,
            rows: toRecords(group.rows),
          })
      : undefined);

  return (
    <Stack spacing={3}>
      <KpiGrid kpis={kpis} />
      {kpiNote ? (
        <Typography variant="body2" color="text.secondary">
          {kpiNote}
        </Typography>
      ) : null}
      {filters.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <ReportFilters
            filters={filters}
            view={view}
            options={options}
            label={label}
            onFilter={setFilter}
            onClear={clearFilters}
          />
        </Paper>
      ) : null}
      <PanelSection
        title={title}
        actions={
          <>
            <GroupByControls
              dims={dims}
              view={view}
              onGroupBy={setGroupBy}
              onGrain={setGrain}
              showGrain={dim === "time"}
            />
            <CsvButton
              name={fileName(dimLabel)}
              build={() =>
                groupsCsv(
                  groups,
                  {
                    dim: dimLabel,
                    count: countHeader,
                    value: measure === "money" ? t("reports.col_usd") : valueHeader ?? countHeader,
                    share: t("web.reports.share"),
                  },
                  groupLabel,
                )
              }
            />
          </>
        }
      >
        <BreakdownTable<R>
          title={title}
          groups={groups}
          dim={dim}
          label={groupLabel}
          measure={measure}
          countHeader={countHeader}
          valueHeader={valueHeader}
          hideValue={hideValue}
          extraColumns={extraColumns}
          splitDims={splitTargets(dims, view)}
          onShowRecords={showGroup}
          onSplit={(group, next) => drillInto(dim, group.key, next)}
        />
      </PanelSection>
      {children}
      {drill ? (
        <RecordsDialog drill={drill} exportName={fileName(drill.title)} onClose={() => setDrill(null)} />
      ) : null}
    </Stack>
  );
}
