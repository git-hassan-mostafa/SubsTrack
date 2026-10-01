import { View } from "react-native";
import type { MonthEntry } from "@shared/core/types";
import { cellJoins } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { MonthCell } from "./MonthCell";

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
  const joins = cellJoins(months, COLUMNS);
  return (
    <View className="flex-row flex-wrap px-1 pb-2">
      {months.map((entry, i) => (
        <MonthCell
          key={entry.billingMonth}
          entry={entry}
          onPress={onCellPress}
          onMenu={onCellMenu}
          menuLoading={loadingBillingMonth === entry.billingMonth}
          isRegular={isRegular}
          connectLeft={joins[i].joinStart}
          connectRight={joins[i].joinEnd}
          wrapFromPrev={joins[i].wrapFromPrev}
          wrapToNext={joins[i].wrapToNext}
          selectionMode={selectionMode}
          selected={isSelected?.(entry.billingMonth) ?? false}
          onToggle={onCellToggle}
          onLongPress={onCellLongPress}
        />
      ))}
    </View>
  );
}
