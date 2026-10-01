import { useTranslation } from "react-i18next";
import type { ActiveFilter } from "@shared/core/types";
import { FilterSelect } from "./FilterSelect";

const OPTIONS: { value: ActiveFilter; labelKey: string }[] = [
  { value: "all", labelKey: "web.filter_all" },
  { value: "active", labelKey: "common.active" },
  { value: "inactive", labelKey: "common.inactive" },
];

interface ActiveFilterSelectProps {
  value: ActiveFilter;
  onChange: (value: ActiveFilter) => void;
}

export function ActiveFilterSelect({ value, onChange }: ActiveFilterSelectProps) {
  const { t } = useTranslation();
  return (
    <FilterSelect<ActiveFilter>
      label={t("web.status")}
      value={value}
      onChange={onChange}
      options={OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
    />
  );
}
