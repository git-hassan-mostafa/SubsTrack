import { I18nManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
}

/**
 * Floating action button anchored to the bottom-trailing corner of a screen.
 * RTL-aware: sits bottom-left in Arabic, bottom-right in English.
 */
export function FAB({ onPress, icon = "add", accessibilityLabel }: FABProps) {
  return (
    <PressableOpacity
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      className="absolute bottom-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg"
      style={[
        I18nManager.isRTL ? { left: 24 } : { right: 24 },
        {
          shadowColor: COLORS.black,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 6,
        },
      ]}
    >
      <Ionicons name={icon} size={28} color={COLORS.white} />
    </PressableOpacity>
  );
}
