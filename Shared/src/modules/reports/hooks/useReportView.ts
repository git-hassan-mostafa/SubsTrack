import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import type { ReportDimension } from "@shared/modules/reports/utils/reportDimensions";
import type { ReportSection } from "@shared/modules/reports/utils/reportSections";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";

// One section's filters, group-by and time step, with setters already bound to it.
export function useReportView(section: ReportSection) {
  const view = useReportsStore((s) => s.views[section]);
  const setFilter = useReportsStore((s) => s.setFilter);
  const clearFilters = useReportsStore((s) => s.clearFilters);
  const setGroupBy = useReportsStore((s) => s.setGroupBy);
  const setGrain = useReportsStore((s) => s.setGrain);
  const drillInto = useReportsStore((s) => s.drillInto);
  return {
    view,
    setFilter: (dim: ReportDimension, key: string | null) => setFilter(section, dim, key),
    clearFilters: () => clearFilters(section),
    setGroupBy: (dim: ReportDimension) => setGroupBy(section, dim),
    setGrain: (grain: TimeGrain | null) => setGrain(section, grain),
    drillInto: (dim: ReportDimension, key: string, next: ReportDimension) =>
      drillInto(section, dim, key, next),
  };
}
