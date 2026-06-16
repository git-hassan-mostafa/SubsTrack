import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";

interface CheckboxProps {
  checked: boolean;
  size?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** When omitted the checkbox is presentational and the parent owns the tap. */
  onPress?: () => void;
}

export function Checkbox({
  checked,
  size = 24,
  disabled = false,
  accessibilityLabel,
  onPress,
}: CheckboxProps) {
  const box = (
    <View
      style={{ width: size, height: size }}
      className={`rounded-md border-2 items-center justify-center ${
        checked ? "border-primary bg-primary" : "border-gray-300 bg-white"
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
