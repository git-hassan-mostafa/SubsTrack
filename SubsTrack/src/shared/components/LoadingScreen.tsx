import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '@/src/shared/constants';

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-gray-50">
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
