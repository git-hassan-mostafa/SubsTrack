import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

const SIZE = {
  48: { box: "w-12 h-12", icon: 22 },
  56: { box: "w-14 h-14", icon: 24 },
} as const;

interface Props {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: keyof typeof SIZE;
}

// round tonal button with its label under it, like a contact screen
export function RoundAction({
  icon,
  label,
  onPress,
  disabled = false,
  size = 48,
}: Props) {
  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled}
      ripple="none"
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-1 items-center px-1 ${disabled ? "opacity-40" : ""}`}
    >
      <PressableOpacity
        onPress={onPress}
        disabled={disabled}
        importantForAccessibility="no"
        containerClassName="rounded-full bg-primary-container mb-1.5"
        className={`${SIZE[size].box} items-center justify-center`}
      >
        <Ionicons
          name={icon}
          size={SIZE[size].icon}
          color={COLORS.onPrimaryContainer}
        />
      </PressableOpacity>
      <Text
        fontWeight="Medium"
        numberOfLines={2}
        className="text-xs text-gray-700 text-center"
      >
        {label}
      </Text>
    </PressableOpacity>
  );
}
