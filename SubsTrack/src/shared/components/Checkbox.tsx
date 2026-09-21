import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";

const CHECKED_TONE = {
  primary: "border-primary bg-primary",
  danger: "border-danger bg-danger",
} as const;

const UNCHECKED_TONE = {
  primary: "border-gray-300 bg-white",
  danger: "border-red-300 bg-white",
} as const;

interface CheckboxProps {
  checked: boolean;
  size?: number;
  tone?: keyof typeof CHECKED_TONE;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
}

export function Checkbox({
  checked,
  size = 24,
  tone = "primary",
  disabled = false,
  accessibilityLabel,
  onPress,
}: CheckboxProps) {
  const box = (
    <View
      style={{ width: size, height: size }}
      className={`rounded-md border-2 items-center justify-center ${
        checked ? CHECKED_TONE[tone] : UNCHECKED_TONE[tone]
      } ${disabled ? "opacity-40" : ""}`}
    >
      {checked ? (
        <Ionicons name="checkmark" size={size - 6} color={COLORS.white} />
      ) : null}
    </View>
  );

  if (!onPress) return box;

  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      {box}
    </PressableOpacity>
  );
}
