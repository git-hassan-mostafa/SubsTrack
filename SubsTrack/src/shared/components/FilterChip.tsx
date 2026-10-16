import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
  leading?: ReactNode;
  dropdown?: boolean;
  disabled?: boolean;
}

// Material 3 filter chip: tonal when picked, outlined otherwise
export function FilterChip({
  label,
  active,
  onPress,
  leading,
  dropdown = false,
  disabled = false,
}: Props) {
  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      containerClassName={`rounded-full border ${
        disabled
          ? "bg-gray-50 border-gray-200 opacity-50"
          : active
            ? "bg-primary-container border-primary-container"
            : "bg-white border-gray-300"
      }`}
      className="h-8 px-3.5 flex-row items-center gap-x-1.5"
    >
      {leading}
      <Text
        fontWeight="Medium"
        className={`text-sm ${active ? "text-primary-on-container" : "text-gray-700"}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {dropdown ? (
        <Ionicons
          name="chevron-down"
          size={14}
          color={active ? COLORS.onPrimaryContainer : COLORS.gray500}
        />
      ) : null}
    </PressableOpacity>
  );
}
