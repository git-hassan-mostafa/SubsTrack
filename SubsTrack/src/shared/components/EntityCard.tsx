import { type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { COLORS } from "@/src/shared/constants";

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
  className?: string;

  children: ReactNode;
}

/**
 * Shared shell for every entity list row (customers, users, plans, branches,
 * currencies, products, sales). Owns the common card chrome — wrapper styling,
 * the tap/long-press selection handshake, the icon-tile↔checkbox swap, and the
 * trailing 3-dot menu — so each card only supplies its own body.
 */
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
  className = "",
  children,
}: EntityCardProps) {
  return (
    <PressableOpacity
      onPress={() => (selectionMode ? onToggleSelect?.() : onPress?.())}
      onLongPress={selectionMode ? undefined : (onEnterSelection ?? onMenu)}
      className={`bg-white border rounded-2xl px-4 py-2 mb-2.5 flex-row items-center ${
        dimmed ? "border-gray-200 opacity-60" : "border-gray-100"
      } ${className}`}
    >
      {/* Leading: icon tile, or a checkbox while selecting (same footprint). */}
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

      {/* Trailing 3-dot menu — hidden while selecting. */}
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
