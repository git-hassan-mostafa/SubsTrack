import { View } from 'react-native';
import { Text } from '@/src/shared/components/Text';

type Color = 'default' | 'success' | 'danger';

interface Props {
  label: string;
  value: string | number;
  color?: Color;
}

const valueColor: Record<Color, string> = {
  default: 'text-gray-900',
  success: 'text-success',
  danger:  'text-danger',
};

export function MetricCard({ label, value, color = 'default' }: Props) {
  return (
    <View className="bg-white border border-gray-200 rounded-lg px-4 py-5 flex-1 items-center">
      <Text className={`text-2xl font-bold ${valueColor[color]}`}>{value}</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">{label}</Text>
    </View>
  );
}
