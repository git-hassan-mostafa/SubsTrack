import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { IconTile } from "@/src/shared/components/IconTile";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

interface Props {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  icon?: ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBgClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  titleLines?: number;
}

// a chevron only when the row really opens something
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  iconBgClassName,
  leading,
  trailing,
  onPress,
  destructive = false,
  disabled = false,
  titleLines = 2,
}: Props) {
  const lead =
    leading ??
    (icon ? (
      <IconTile
        icon={icon}
        color={iconColor ?? (destructive ? COLORS.danger : COLORS.primary)}
        bgClassName={
          iconBgClassName ?? (destructive ? "bg-red-50" : "bg-primary-container")
        }
      />
    ) : null);

  const body = (
    <>
      {lead ? <View className="me-4">{lead}</View> : null}
      <View className="flex-1 min-w-0">
        <Text
          fontWeight="Medium"
          numberOfLines={titleLines}
          className={`text-base ${destructive ? "text-danger" : "text-gray-900"}`}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className="text-sm text-gray-500 ms-3 max-w-[50%]" numberOfLines={2}>
          {value}
        </Text>
      ) : null}
      {trailing ? <View className="ms-3">{trailing}</View> : null}
      {onPress && !trailing ? (
        <View className="ms-2">
          <DirectionalIcon name="chevron-forward" size={18} color={COLORS.gray400} />
        </View>
      ) : null}
    </>
  );

  const rowClass = `flex-row items-center px-4 py-3 ${subtitle ? "min-h-[72px]" : "min-h-14"}`;

  if (!onPress) return <View className={rowClass}>{body}</View>;

  return (
    <PressableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`${rowClass} ${disabled ? "opacity-40" : ""}`}
    >
      {body}
    </PressableOpacity>
  );
}
