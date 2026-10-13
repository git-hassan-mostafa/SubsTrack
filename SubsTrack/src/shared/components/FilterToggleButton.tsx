import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";

interface Props {
  hasActiveFilters?: boolean;
  onPress: () => void;
}

// In-body opener of a FiltersSheet, for a list that has no PageHeader of its own.
export function FilterToggleButton({ hasActiveFilters, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <PressableOpacity
      onPress={onPress}
      className="items-center justify-center w-9 h-9 rounded-xl bg-gray-100"
      accessibilityLabel={t("filters.title")}
    >
      <Ionicons
        name="filter-outline"
        size={16}
        color={hasActiveFilters ? COLORS.primary : COLORS.gray500}
      />
      {hasActiveFilters ? (
        <View className="absolute top-1.5 end-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
      ) : null}
    </PressableOpacity>
  );
}
