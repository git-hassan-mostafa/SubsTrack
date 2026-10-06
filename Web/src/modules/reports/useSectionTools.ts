import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useReportLabels } from "@shared/modules/reports/hooks/useReportLabels";
import { useReportsStore } from "@shared/modules/reports/state/reportsStore";
import type { ReportDimension } from "@shared/modules/reports/utils/reportDimensions";
import {
  SECTION_LABEL_KEY,
  type ReportSection,
} from "@shared/modules/reports/utils/reportSections";
import type { TimeGrain } from "@shared/modules/reports/utils/timeBuckets";

const NO_NAMES: ReadonlyMap<string, string> = new Map();

// Labels for this section's keys, and file names that carry the section and period.
export function useSectionTools(
  section: ReportSection,
  grain: TimeGrain,
  names: ReadonlyMap<string, string> = NO_NAMES,
) {
  const { t } = useTranslation();
  const labeler = useReportLabels();
  const period = useReportsStore((s) => s.period);
  const label = useCallback(
    (dim: ReportDimension, key: string) => labeler(dim, key, { names, grain }),
    [grain, labeler, names],
  );
  const fileName = useCallback(
    (part?: string) =>
      [t(SECTION_LABEL_KEY[section]), part, period.fromDate, period.toDate]
        .filter(Boolean)
        .join("-"),
    [period.fromDate, period.toDate, section, t],
  );
  return { label, fileName, period };
}
