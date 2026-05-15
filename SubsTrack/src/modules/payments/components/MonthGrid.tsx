import { View } from 'react-native';
import type { MonthEntry } from '@/src/core/types';
import { MonthCell } from './MonthCell';

interface Props {
  months: MonthEntry[];
  onCellPress: (entry: MonthEntry) => void;
  isRegular: boolean;
}

export function MonthGrid({ months, onCellPress, isRegular }: Props) {
  return (
    <View className="flex-row flex-wrap px-1 pb-2">
      {months.map((entry) => (
        <MonthCell key={entry.billingMonth} entry={entry} onPress={onCellPress} isRegular={isRegular} />
      ))}
    </View>
  );
}
