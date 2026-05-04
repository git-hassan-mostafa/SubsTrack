import { Pressable, Text, View } from 'react-native';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex-row items-center justify-between">
      <Text className="text-danger text-sm flex-1">{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} className="ms-3">
          <Text className="text-danger font-bold text-base">✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
