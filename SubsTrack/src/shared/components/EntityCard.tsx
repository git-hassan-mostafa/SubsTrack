import { type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import {
  CARD_SURFACE,
  CARD_SURFACE_DIMMED,
  COLORS,
} from "@/src/shared/constants";

interface EntityCardProps {
  icon: ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBgClassName?: string;

  onPress?: () => void;
  onMenu?: () => void;
  menuLoading?: boolean;
  reserveMenuSpace?: boolean;

  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEnterSelection?: () => void;

  dimmed?: boolean;
  disabled?: boolean;
  className?: string;

  children: ReactNode;
}

// Shared shell for every list row: chrome, selection handshake, 3-dot menu.
export function EntityCard({
  icon,
  iconColor = COLORS.primary,
  iconBgClassName = "bg-indigo-50",
  onPress,
  onMenu,
  menuLoading = false,
  reserveMenuSpace = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
  dimmed = false,
  disabled = false,
  className = "",
  children,
}: EntityCardProps) {
  return (
    <PressableOpacity
      onPress={() => (selectionMode ? onToggleSelect?.() : onPress?.())}
      onLongPress={selectionMode ? undefined : (onEnterSelection ?? onMenu)}
      disabled={disabled}
      className={`${
        dimmed ? CARD_SURFACE_DIMMED : CARD_SURFACE
      } px-4 py-2 flex-row items-center mb-2.5 ${className}`}
    >
      {selectionMode ? (
        <View className="w-10 h-10 items-center justify-center me-3 flex-shrink-0">
          <Checkbox checked={selected} />
        </View>
      ) : (
        <View
          className={`w-10 h-10 rounded-xl items-center justify-center me-3 ${iconBgClassName}`}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      )}

      {children}

      {onMenu && !selectionMode ? (
        <PressableOpacity
          onPress={onMenu}
          disabled={menuLoading}
          hitSlop={8}
          className="ms-1 w-9 h-9 items-center justify-center rounded-full"
        >
          {menuLoading ? (
            <ActivityIndicator size="small" color={COLORS.gray600} />
          ) : (
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={COLORS.gray600}
            />
          )}
        </PressableOpacity>
      ) : reserveMenuSpace && !selectionMode ? (
        <View className="ms-1 w-9 h-9" />
      ) : null}
    </PressableOpacity>
  );
}
