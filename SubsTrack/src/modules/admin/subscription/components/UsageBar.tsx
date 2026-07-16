import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import type { TierResource } from '@/src/core/types';

interface Props {
  resource: TierResource;
  current: number;
  limit: number | null;
}

export function UsageBar({ resource, current, limit }: Props) {
  const { t } = useTranslation();
  const isUnlimited = limit === null;
  const ratio = isUnlimited ? 0 : Math.min(1, current / Math.max(1, limit));
  const pct = Math.round(ratio * 100);

  const fillColor = isUnlimited
    ? 'bg-emerald-500'
    : ratio >= 1
      ? 'bg-danger'
      : ratio >= 0.8
        ? 'bg-warning'
        : 'bg-primary';

  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-xs text-gray-600 capitalize">
          {t(`subscription.resource.${resource}`)}
        </Text>
        <Text className="text-xs font-semibold text-gray-900">
          {isUnlimited
            ? `${current} / ∞`
            : `${current} / ${limit}`}
        </Text>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View
          className={`h-full ${fillColor}`}
          style={{ width: isUnlimited ? '100%' : `${pct}%` }}
        />
      </View>
    </View>
  );
}
