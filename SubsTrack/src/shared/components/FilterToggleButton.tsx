import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { IconButton } from "./IconButton";

interface Props {
  hasActiveFilters?: boolean;
  onPress: () => void;
}

// In-body opener of a FiltersSheet, for a list that has no PageHeader of its own.
export function FilterToggleButton({ hasActiveFilters, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <IconButton
      icon="filter-outline"
      size={20}
      onPress={onPress}
      accessibilityLabel={t("filters.title")}
      color={hasActiveFilters ? COLORS.primary : COLORS.gray600}
      badge={hasActiveFilters}
    />
  );
}
