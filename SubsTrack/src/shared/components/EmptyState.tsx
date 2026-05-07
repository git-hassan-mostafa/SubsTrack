import { View } from 'react-native';
import { Text } from '@/src/shared/components/Text';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
}

export function EmptyState({ message, subMessage }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Text className="text-lg font-semibold text-gray-500 text-center">{message}</Text>
      {subMessage ? (
        <Text className="text-sm text-gray-400 text-center mt-2">{subMessage}</Text>
      ) : null}
    </View>
  );
}
