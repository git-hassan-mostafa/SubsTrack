import { type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { Checkbox } from "@/src/shared/components/Checkbox";
import { Avatar } from "@/src/shared/components/Avatar";
import { IconButton } from "@/src/shared/components/IconButton";
import { IconTile } from "@/src/shared/components/IconTile";
import {
  CARD_SURFACE,
  CARD_SURFACE_DIMMED,
  COLORS,
} from "@/src/shared/constants";

interface EntityCardProps {
  icon?: ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBgClassName?: string;
  renderIcon?: ReactNode;
  avatarName?: string;

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

function Leading({
  icon,
  iconColor,
  iconBgClassName,
  renderIcon,
  avatarName,
}: Pick<
  EntityCardProps,
  "icon" | "iconColor" | "iconBgClassName" | "renderIcon" | "avatarName"
>) {
  if (renderIcon) {
    return (
      <View className="w-10 h-10 items-center justify-center">{renderIcon}</View>
    );
  }
  if (avatarName !== undefined) return <Avatar name={avatarName} />;
  if (icon) {
    return <IconTile icon={icon} color={iconColor} bgClassName={iconBgClassName} />;
  }
  return <View className="w-10 h-10" />;
}

// Shared shell for every list row: chrome, selection handshake, 3-dot menu.
export function EntityCard({
  icon,
  iconColor = COLORS.primary,
  iconBgClassName = "bg-indigo-50",
  renderIcon,
  avatarName,
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
      containerClassName={`${
        dimmed ? CARD_SURFACE_DIMMED : CARD_SURFACE
      } mb-2.5 ${className}`}
      className="ps-4 pe-2 py-3 min-h-[72px] flex-row items-center"
    >
      <View className="me-3 flex-shrink-0">
        {selectionMode ? (
          <View className="w-10 h-10 items-center justify-center">
            <Checkbox checked={selected} />
          </View>
        ) : (
          <Leading
            icon={icon}
            iconColor={iconColor}
            iconBgClassName={iconBgClassName}
            renderIcon={renderIcon}
            avatarName={avatarName}
          />
        )}
      </View>

      {children}

      {onMenu && !selectionMode ? (
        <IconButton
          icon="ellipsis-vertical"
          size={20}
          color={COLORS.gray600}
          onPress={onMenu}
          loading={menuLoading}
        />
      ) : reserveMenuSpace && !selectionMode ? (
        <View className="w-12 h-12" />
      ) : (
        <View className="w-2" />
      )}
    </PressableOpacity>
  );
}
