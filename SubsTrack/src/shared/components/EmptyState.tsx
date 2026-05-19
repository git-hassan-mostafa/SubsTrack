import { View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { Button } from '@/src/shared/components/Button';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, subMessage, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Text className="text-lg font-semibold text-gray-500 text-center">{message}</Text>
      {subMessage ? (
        <Text className="text-sm text-gray-400 text-center mt-2">{subMessage}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-6">
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
