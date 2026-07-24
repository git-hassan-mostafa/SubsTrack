import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";

interface Props {
  active: boolean;
  hasActiveFilters?: boolean;
  onPress: () => void;
}

// Icon button that toggles a collapsible filter bar. Sits beside the search
// box (or alone if a screen has no search) on every list screen with filters.
// The small dot signals filters are applied even while the bar is collapsed.
export function FilterToggleButton({
  active,
  hasActiveFilters,
  onPress,
}: Props) {
  return (
    <PressableOpacity
      onPress={onPress}
      className={`items-center justify-center w-9 h-9 rounded-xl ${active ? "bg-gray-900" : "bg-gray-100"}`}
      accessibilityLabel="Toggle filters"
    >
      <Ionicons
        name="filter"
        size={16}
        color={active ? COLORS.white : COLORS.gray500}
      />
      {hasActiveFilters ? (
        <View className="absolute top-1.5 end-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
      ) : null}
    </PressableOpacity>
  );
}
