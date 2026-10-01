import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/material/Box";
import type { MonthEntry } from "@shared/core/types";
import { cellJoins } from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import type { TableAction } from "@/shared/table/tableAction";
import { MonthCell } from "./MonthCell";

interface MonthGridProps {
  months: MonthEntry[];
  isRegular: boolean;
  busyMonth: string | null;
  isSelected: (billingMonth: string) => boolean;
  menuActions: (entry: MonthEntry) => TableAction[];
  onOpen: (entry: MonthEntry) => void;
  onToggle: (entry: MonthEntry) => void;
}

// Six months a row on a wide screen; the joins follow the real row breaks.
export function MonthGrid({
  months,
  isRegular,
  busyMonth,
  isSelected,
  menuActions,
  onOpen,
  onToggle,
}: MonthGridProps) {
  const wide = useMediaQuery(useTheme().breakpoints.up("md"));
  const columns = wide ? 6 : 4;
  const joins = cellJoins(months, columns);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        p: 1,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      {months.map((entry, i) => (
        <MonthCell
          key={entry.billingMonth}
          entry={entry}
          join={joins[i]}
          isRegular={isRegular}
          busy={busyMonth === entry.billingMonth}
          selected={isSelected(entry.billingMonth)}
          menuActions={menuActions}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </Box>
  );
}
