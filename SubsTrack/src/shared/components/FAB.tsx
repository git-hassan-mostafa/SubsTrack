import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity";

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
}

export function FAB({ onPress, icon = "add", accessibilityLabel }: FABProps) {
  return (
    <PressableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      rippleColor={COLORS.rippleOnDark}
      containerClassName="absolute bottom-6 end-6 rounded-2xl bg-primary elevation-md"
      className="h-14 w-14 items-center justify-center"
    >
      <Ionicons name={icon} size={28} color={COLORS.white} />
    </PressableOpacity>
  );
}
