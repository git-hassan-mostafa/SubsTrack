import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { Button } from "@/src/shared/components/Button";
import { COLORS } from "@/src/shared/constants";

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ComponentProps<typeof Ionicons>["name"];
}

export function EmptyState({
  message,
  subMessage,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      {icon ? (
        <View className="w-20 h-20 rounded-full bg-gray-100 items-center justify-center mb-5">
          <Ionicons name={icon} size={36} color={COLORS.gray400} />
        </View>
      ) : null}
      <Text fontWeight="SemiBold" className="text-lg text-gray-700 text-center">
        {message}
      </Text>
      {subMessage ? (
        <Text className="text-sm text-gray-500 text-center mt-2">
          {subMessage}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-6">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
