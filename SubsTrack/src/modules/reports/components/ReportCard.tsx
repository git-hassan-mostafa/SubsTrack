import type { ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { COLORS } from "@/src/shared/constants";

interface Props {
  title: string;
  subtitle?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}

/** Titled white card — the container every non-chart report block sits in. */
export function ReportCard({
  title,
  subtitle,
  actionIcon,
  actionLabel,
  onAction,
  children,
}: Props) {
  return (
    <View className="bg-white border border-gray-100 rounded-2xl p-4">
      <View className="flex-row items-center gap-2">
        <View className="flex-1 min-w-0">
          <Text fontWeight="Bold" className="text-sm text-gray-900">
            {title}
          </Text>
          {subtitle ? <Text className="text-xs text-gray-400 mt-0.5">{subtitle}</Text> : null}
        </View>
        {actionIcon && onAction ? (
          <PressableOpacity
            onPress={onAction}
            hitSlop={8}
            className="p-1"
            accessibilityLabel={actionLabel}
          >
            <Ionicons name={actionIcon} size={18} color={COLORS.gray500} />
          </PressableOpacity>
        ) : null}
      </View>
      <View className="mt-3">{children}</View>
    </View>
  );
}
