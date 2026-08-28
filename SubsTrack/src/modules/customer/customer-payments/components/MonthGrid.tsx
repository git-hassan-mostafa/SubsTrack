import { View } from 'react-native';
import type { Charge, MonthEntry } from '@/src/core/types';
import { MonthCell } from './MonthCell';

interface Props {
  months: MonthEntry[];
  onCellPress: (entry: MonthEntry) => void;
  onCellMenu?: (entry: MonthEntry) => void;
  // Billing month currently being quick-paid — its cell shows a spinner.
  loadingBillingMonth?: string | null;
  isRegular: boolean;
  // Multi-select mode wiring.
  selectionMode?: boolean;
  isSelected?: (billingMonth: string) => boolean;
  onCellToggle?: (entry: MonthEntry) => void;
  onCellLongPress?: (entry: MonthEntry) => void;
}

// The grid always has 4 cells per row (Jan–Apr, May–Aug, Sep–Dec).
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
        // The payment ID shared by this cell (null if not part of a multi-month group).
        const myGroup = groupIdOf(entry);

        // Neighbouring cells in the flat array — null at the edges of the grid.
        const prev = i > 0 ? months[i - 1] : null;
        const next = i < months.length - 1 ? months[i + 1] : null;

        // Whether this cell sits at the first or last position in its row.
        const atRowStart = i % COLUMNS === 0;
        const atRowEnd = (i + 1) % COLUMNS === 0;

        // Whether the left/right neighbour belongs to the same multi-month bill.
        const sameGroupAsPrev =
          !!myGroup && prev != null && groupIdOf(prev) === myGroup;
        const sameGroupAsNext =
          !!myGroup && next != null && groupIdOf(next) === myGroup;

        // Same row — cells touch with no gap and shared corners go square, forming one wide pill.
        const connectLeft = sameGroupAsPrev && !atRowStart;
        const connectRight = sameGroupAsNext && !atRowEnd;

        // Different rows within the same year — corner is squared and a chevron arrow is shown
        // so the visual break between rows reads as a continuation, not a separate cell.
        const wrapFromPrev = sameGroupAsPrev && atRowStart;
        const wrapToNext = sameGroupAsNext && atRowEnd;

        // Different years — January continuing a bill from the previous December.
        const crossYearFromPrev =
          i === 0 && entry.status === 'paid' && entry.isGroupSecondary;

        // Different years — December whose bill spills into next January.
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
            // Merge same-row wraps with cross-year wraps so MonthCell only needs one prop each.
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
