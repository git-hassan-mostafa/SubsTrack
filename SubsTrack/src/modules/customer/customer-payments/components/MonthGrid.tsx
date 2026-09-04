import { View } from 'react-native';
import type { Charge, MonthEntry } from '@/src/core/types';
import { MonthCell } from './MonthCell';

interface Props {
  months: MonthEntry[];
  onCellPress: (entry: MonthEntry) => void;
  onCellMenu?: (entry: MonthEntry) => void;
  loadingBillingMonth?: string | null;
  isRegular: boolean;
  selectionMode?: boolean;
  isSelected?: (billingMonth: string) => boolean;
  onCellToggle?: (entry: MonthEntry) => void;
  onCellLongPress?: (entry: MonthEntry) => void;
}

const COLUMNS = 4;

// The BILL id when the month is settled (a partial reports as "paid"), else
// null — this is what tells the cells of one multi-month block apart.
function groupIdOf(entry: MonthEntry): string | null {
  return entry.status === 'paid' && entry.charge ? entry.charge.id : null;
}

// Whether a bill starting in currentYear reaches at least January of the next.
function billCoversNextYearJanuary(charge: Charge, currentYear: number): boolean {
  if (!charge.billingMonth) return false;
  const startYear = parseInt(charge.billingMonth.substring(0, 4));
  const startMonth = parseInt(charge.billingMonth.substring(5, 7));
  const endAbsolute = startYear * 12 + startMonth + charge.durationMonths - 1;
  return endAbsolute >= (currentYear + 1) * 12 + 1;
}

export function MonthGrid({
  months,
  onCellPress,
  onCellMenu,
  loadingBillingMonth,
  isRegular,
  selectionMode = false,
  isSelected,
  onCellToggle,
  onCellLongPress,
}: Props) {
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

        const connectLeft = sameGroupAsPrev && !atRowStart;
        const connectRight = sameGroupAsNext && !atRowEnd;

        const wrapFromPrev = sameGroupAsPrev && atRowStart;
        const wrapToNext = sameGroupAsNext && atRowEnd;

        const crossYearFromPrev =
          i === 0 && entry.status === 'paid' && entry.isGroupSecondary;

        const crossYearToNext =
          i === months.length - 1 &&
          entry.status === 'paid' &&
          entry.charge != null &&
          billCoversNextYearJanuary(entry.charge, entry.year);

        return (
          <MonthCell
            key={entry.billingMonth}
            entry={entry}
            onPress={onCellPress}
            onMenu={onCellMenu}
            menuLoading={loadingBillingMonth === entry.billingMonth}
            isRegular={isRegular}
            connectLeft={connectLeft}
            connectRight={connectRight}
            wrapFromPrev={wrapFromPrev || crossYearFromPrev}
            wrapToNext={wrapToNext || crossYearToNext}
            selectionMode={selectionMode}
            selected={isSelected?.(entry.billingMonth) ?? false}
            onToggle={onCellToggle}
            onLongPress={onCellLongPress}
          />
        );
      })}
    </View>
  );
}
