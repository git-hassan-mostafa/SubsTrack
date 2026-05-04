import { useMemo } from 'react';
import { View } from 'react-native';
import type { MonthEntry } from '@/src/core/types';
import { MonthCell } from './MonthCell';

interface Props {
  months: MonthEntry[];
  onCellPress: (entry: MonthEntry) => void;
}

export function MonthGrid({ months, onCellPress }: Props) {
  const cells = useMemo(() => months, [months]);

  return (
    <View className="flex-row flex-wrap">
      {cells.map((entry) => (
        <MonthCell key={entry.billingMonth} entry={entry} onPress={onCellPress} />
      ))}
    </View>
  );
}
