import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  DIMENSION_LABEL_KEY,
  type ReportDimension,
  type SectionViewState,
} from "@shared/modules/reports/utils/reportDimensions";
import { TIME_GRAINS, type TimeGrain } from "@shared/modules/reports/utils/timeBuckets";
import { FilterBar } from "@/shared/table/FilterBar";
import { MultiFilterSelect } from "@/shared/table/MultiFilterSelect";

const SEARCHABLE_FROM = 8;

const AUTO_GRAIN = "auto";

type DimLabel = (dim: ReportDimension, key: string) => string;

interface ReportFiltersProps {
  filters: readonly ReportDimension[];
  view: SectionViewState;
  options: Partial<Record<ReportDimension, string[]>>;
  label: DimLabel;
  onFilter: (dim: ReportDimension, keys: readonly string[]) => void;
  onClear: () => void;
}

// Pinned chips show all active filters; drill-down pins more than dropdowns show.
export function ReportFilters({ filters, view, options, label, onFilter, onClear }: ReportFiltersProps) {
  const { t } = useTranslation();
  const pinned = (
    Object.entries(view.filter) as [ReportDimension, readonly string[] | undefined][]
  ).filter(
    (entry): entry is [ReportDimension, readonly string[]] =>
      Boolean(entry[1] && entry[1].length > 0),
  );
  return (
    <Stack spacing={1.5}>
      <FilterBar>
        {filters.map((dim) => {
          const keys = options[dim] ?? [];
          const choices = keys
            .map((key) => ({ value: key, label: label(dim, key) }))
            .sort((a, b) => a.label.localeCompare(b.label));
          return (
            <MultiFilterSelect<string>
              key={dim}
              label={t(DIMENSION_LABEL_KEY[dim])}
              value={view.filter[dim] ?? []}
              onChange={(next) => onFilter(dim, next)}
              options={choices}
              allLabel={t("web.filter_all")}
              searchable={choices.length >= SEARCHABLE_FROM}
              minWidth={170}
            />
          );
        })}
        {pinned.length > 0 ? <Button onClick={onClear}>{t("common.clear_filters")}</Button> : null}
      </FilterBar>
      {pinned.length > 0 ? (
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
          {pinned.flatMap(([dim, keys]) =>
            keys.map((key) => (
              <Chip
                key={`${dim}-${key}`}
                label={`${t(DIMENSION_LABEL_KEY[dim])}: ${label(dim, key)}`}
                onDelete={() => onFilter(dim, keys.filter((k) => k !== key))}
              />
            )),
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}

interface GroupByControlsProps {
  dims: readonly ReportDimension[];
  view: SectionViewState;
  onGroupBy?: (dim: ReportDimension) => void;
  onGrain: (grain: TimeGrain | null) => void;
  showGrain: boolean;
}

export function GroupByControls({ dims, view, onGroupBy, onGrain, showGrain }: GroupByControlsProps) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      {onGroupBy ? (
        <TextField
          select
          size="small"
          label={t("web.reports.group_by")}
          value={view.groupBy}
          onChange={(event) => onGroupBy(event.target.value as ReportDimension)}
          sx={{ minWidth: 180 }}
        >
          {dims.map((dim) => (
            <MenuItem key={dim} value={dim}>
              {t(DIMENSION_LABEL_KEY[dim])}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      {showGrain ? (
        <TextField
          select
          size="small"
          label={t("web.reports.time_step")}
          value={view.grain ?? AUTO_GRAIN}
          onChange={(event) =>
            onGrain(event.target.value === AUTO_GRAIN ? null : (event.target.value as TimeGrain))
          }
          sx={{ minWidth: 150 }}
        >
          <MenuItem value={AUTO_GRAIN}>{t("web.reports.grain_auto")}</MenuItem>
          {TIME_GRAINS.map((grain) => (
            <MenuItem key={grain} value={grain}>
              {t(`web.reports.grain_${grain}`)}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
    </Stack>
  );
}
