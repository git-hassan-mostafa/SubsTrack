import { View } from 'react-native';
import type { MonthEntry } from '@/src/core/types';
import { MonthCell } from './MonthCell';

interface Props {
  months: MonthEntry[];
  onCellPress: (entry: MonthEntry) => void;
  isRegular: boolean;
}

const COLUMNS = 4;

// A cell "belongs to a group" when it's a paid month tied to a payment.
function groupIdOf(entry: MonthEntry): string | null {
  return entry.status === 'paid' && entry.payment ? entry.payment.id : null;
}

export function MonthGrid({ months, onCellPress, isRegular }: Props) {
  return (
    <View className="flex-row flex-wrap px-1 pb-2">
      {months.map((entry, i) => {
        const myGroup = groupIdOf(entry);
        const prev = i > 0 ? months[i - 1] : null;
        const next = i < months.length - 1 ? months[i + 1] : null;
        const atRowStart = i % COLUMNS === 0;
        const atRowEnd = (i + 1) % COLUMNS === 0;
        const sameGroupAsPrev =
          !!myGroup && prev != null && groupIdOf(prev) === myGroup;
        const sameGroupAsNext =
          !!myGroup && next != null && groupIdOf(next) === myGroup;
        // In-row neighbours visually merge (no gap, square shared corners).
        const connectLeft = sameGroupAsPrev && !atRowStart;
        const connectRight = sameGroupAsNext && !atRowEnd;
        // Cross-row neighbours show a cut edge + chevron so the wrap reads as continuation.
        const wrapFromPrev = sameGroupAsPrev && atRowStart;
        const wrapToNext = sameGroupAsNext && atRowEnd;
        return (
          <MonthCell
            key={entry.billingMonth}
            entry={entry}
            onPress={onCellPress}
            isRegular={isRegular}
            connectLeft={connectLeft}
            connectRight={connectRight}
            wrapFromPrev={wrapFromPrev}
            wrapToNext={wrapToNext}
          />
        );
      })}
    </View>
  );
}
