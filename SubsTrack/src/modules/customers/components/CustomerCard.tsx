import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Customer } from '@/src/core/types';

interface Props {
  customer: Customer;
  unpaidCount: number;
  onPress: (customer: Customer) => void;
}

export function CustomerCard({ customer, unpaidCount, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => onPress(customer)}
      className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-3"
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-semibold text-gray-900 flex-1 me-2" numberOfLines={1}>
          {customer.name}
        </Text>
        <View className="flex-row items-center gap-2">
          {unpaidCount > 0 ? (
            <View className="bg-danger rounded-full px-2 py-0.5 min-w-[22px] items-center">
              <Text className="text-white text-xs font-bold">{unpaidCount}</Text>
            </View>
          ) : null}
          <View className={`rounded-full px-2 py-0.5 ${customer.active ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Text className={`text-xs font-medium ${customer.active ? 'text-green-700' : 'text-gray-500'}`}>
              {customer.active ? t('common.active') : t('common.inactive')}
            </Text>
          </View>
        </View>
      </View>
      <Text className="text-sm text-gray-500">
        {customer.plan?.name ?? t('common.no_plan')}
      </Text>
    </Pressable>
  );
}
