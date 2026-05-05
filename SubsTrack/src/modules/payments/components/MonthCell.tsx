import { memo } from 'react';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MonthEntry, MonthStatus } from '@/src/core/types';

interface Props {
  entry: MonthEntry;
  onPress: (entry: MonthEntry) => void;
}

const bgColor: Record<MonthStatus, string> = {
  paid:   'bg-success',
  unpaid: 'bg-danger',
  future: 'bg-gray-200',
};

const textColor: Record<MonthStatus, string> = {
  paid:   'text-white',
  unpaid: 'text-white',
  future: 'text-gray-500',
};

export const MonthCell = memo(function MonthCell({ entry, onPress }: Props) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={() => onPress(entry)}
      className={`w-1/4 aspect-square items-center justify-center border border-gray-100 ${bgColor[entry.status]}`}
    >
      <Text className={`text-sm font-semibold ${textColor[entry.status]}`}>
        {t(`months.${entry.label}`)}
      </Text>
    </Pressable>
  );
});
