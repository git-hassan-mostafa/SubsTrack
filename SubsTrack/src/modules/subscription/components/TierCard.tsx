import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { PressableOpacity } from '@/src/shared/components/PressableOpacity';
import { COLORS } from '@/src/shared/constants';
import type { TierPlan } from '@/src/core/types';

interface Props {
  tier: TierPlan;
  isCurrent: boolean;
  direction: 'upgrade' | 'downgrade' | 'current';
  onAction?: (tier: TierPlan) => void;
  disabled?: boolean;
}

function formatLimit(value: number | null): string {
  return value === null ? '∞' : String(value);
}

export function TierCard({ tier, isCurrent, direction, onAction, disabled }: Props) {
  const { t } = useTranslation();

  const features: { key: string; label: string; value: string }[] = [
    { key: 'customers',     label: t('subscription.resource.customers'),     value: formatLimit(tier.maxCustomers) },
    { key: 'users',         label: t('subscription.resource.users'),         value: formatLimit(tier.maxUsers) },
    { key: 'plans',         label: t('subscription.resource.plans'),         value: formatLimit(tier.maxPlans) },
    { key: 'branches',      label: t('subscription.resource.branches'),      value: formatLimit(tier.maxBranches) },
    {
      key: 'multi_currency',
      label: t('subscription.feature.multi_currency'),
      value: tier.multiCurrencyEnabled ? t('common.yes') : t('common.no'),
    },
    {
      key: 'multi_month',
      label: t('subscription.feature.multi_month'),
      value: tier.multiMonthPlansEnabled ? t('common.yes') : t('common.no'),
    },
    {
      key: 'grace_days',
      label: t('subscription.feature.grace_days'),
      value: String(tier.graceDays),
    },
  ];

  return (
    <View
      className={`rounded-2xl p-5 mb-3 border ${
        isCurrent
          ? 'border-primary bg-indigo-50/30'
          : 'border-gray-200 bg-white'
      }`}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xl font-semibold text-gray-900">{tier.name}</Text>
        {isCurrent ? (
          <View className="bg-primary rounded-full px-2.5 py-0.5 flex-row items-center">
            <Ionicons name="checkmark" size={12} color={COLORS.white} />
            <Text className="text-[10px] font-semibold uppercase text-white ms-1">
              {t('subscription.current_plan')}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row items-baseline mb-4">
        <Text className="text-3xl font-bold text-gray-900">
          ${tier.priceMonthlyUsd}
        </Text>
        <Text className="text-sm text-gray-500 ms-1">
          {t('subscription.per_month')}
        </Text>
      </View>

      {features.map((f) => (
        <View key={f.key} className="flex-row items-center justify-between py-1">
          <Text className="text-sm text-gray-600">{f.label}</Text>
          <Text className="text-sm font-semibold text-gray-900">{f.value}</Text>
        </View>
      ))}

      {!isCurrent && onAction ? (
        <PressableOpacity
          onPress={() => onAction(tier)}
          disabled={disabled}
          className={`mt-4 rounded-lg py-3 items-center ${
            disabled
              ? 'bg-gray-200'
              : direction === 'upgrade'
                ? 'bg-primary'
                : 'border border-gray-300 bg-white'
          }`}
        >
          <Text
            className={`font-semibold ${
              disabled
                ? 'text-gray-400'
                : direction === 'upgrade'
                  ? 'text-white'
                  : 'text-gray-700'
            }`}
          >
            {direction === 'upgrade'
              ? t('subscription.upgrade_to', { name: tier.name })
              : t('subscription.downgrade_to', { name: tier.name })}
          </Text>
        </PressableOpacity>
      ) : null}
    </View>
  );
}
