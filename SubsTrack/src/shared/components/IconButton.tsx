import type { ComponentProps } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

interface Props {
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  accessibilityLabel?: string;
  color?: string;
  size?: number;
  badge?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

// 48x48 touch target with the round borderless ripple Android icons use
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = COLORS.gray700,
  size = 24,
  badge = false,
  loading = false,
  disabled = false,
}: Props) {
  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      ripple="borderless"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`w-12 h-12 items-center justify-center ${disabled ? "opacity-40" : ""}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.gray600} />
      ) : (
        <Ionicons name={icon} size={size} color={color} />
      )}
      {badge ? (
        <View className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-amber-500" />
      ) : null}
    </PressableOpacity>
  );
}
