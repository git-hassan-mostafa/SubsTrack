import { View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import type { TierPlan } from '@/src/core/types';

const STYLES: Record<TierPlan['code'], { bg: string; text: string }> = {
  free: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pro: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  business: { bg: 'bg-amber-50', text: 'text-amber-700' },
};

export function TierBadge({ tier }: { tier: TierPlan | null | undefined }) {
  if (!tier) return null;
  const style = STYLES[tier.code];
  return (
    <View className={`${style.bg} rounded-full px-2.5 py-0.5`}>
      <Text className={`text-[10px] font-semibold uppercase ${style.text}`}>
        {tier.name}
      </Text>
    </View>
  );
}
