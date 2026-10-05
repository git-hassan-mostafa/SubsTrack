import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import CheckCircle from "@mui/icons-material/CheckCircle";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import RadioButtonUnchecked from "@mui/icons-material/RadioButtonUnchecked";
import type { MonthEntry } from "@shared/core/types";
import {
  CELL_BADGE_KEYS,
  cellBadge,
  type CellJoin,
} from "@shared/modules/customer/customer-payments/utils/monthGridLayout";
import { isSelectableMonth } from "@shared/modules/customer/customer-payments/utils/monthView";
import type { TableAction } from "@/shared/table/tableAction";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { monthCellLook } from "./monthCellLook";
import { monthStatusLook } from "./monthStatusLook";

interface MonthCellProps {
  entry: MonthEntry;
  join: CellJoin;
  isRegular: boolean;
  busy: boolean;
  selected: boolean;
  menuActions: (entry: MonthEntry) => TableAction[];
  onOpen: (entry: MonthEntry) => void;
  onToggle: (entry: MonthEntry) => void;
}

const RADIUS = 12;
const CELL_HEIGHT = 96;

// Checkbox and ⋮ sit BESIDE the cell button — never a button in a button.
export function MonthCell({
  entry,
  join,
  isRegular,
  busy,
  selected,
  menuActions,
  onOpen,
  onToggle,
}: MonthCellProps) {
  const { t } = useTranslation();
  const look = monthCellLook(entry, isRegular);
  const badge = cellBadge(entry);
  const selectable = isSelectableMonth(entry);
  const monthYear = `${t(`months.${entry.label}`)} ${entry.year}`;
  const squareStart = join.joinStart || join.wrapFromPrev;
  const squareEnd = join.joinEnd || join.wrapToNext;

  return (
    <Box
      sx={{
        position: "relative",
        py: 0.5,
        paddingInlineStart: join.joinStart ? 0 : 0.5,
        paddingInlineEnd: join.joinEnd ? 0 : 0.5,
      }}
    >
      <ButtonBase
        onClick={() => onOpen(entry)}
        aria-label={t("web.month_grid.cell_label", {
          month: monthYear,
          status: t(monthStatusLook(entry, isRegular).labelKey),
        })}
        sx={{
          width: "100%",
          height: CELL_HEIGHT,
          flexDirection: "column",
          gap: 0.5,
          bgcolor: look.bg,
          color: look.fg,
          border: 2,
          borderColor: selected ? "primary.main" : (look.ring ?? "transparent"),
          borderStartStartRadius: squareStart ? 0 : RADIUS,
          borderEndStartRadius: squareStart ? 0 : RADIUS,
          borderStartEndRadius: squareEnd ? 0 : RADIUS,
          borderEndEndRadius: squareEnd ? 0 : RADIUS,
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
          {t(`months.${entry.label}`)}
        </Typography>
        <Typography
          component="span"
          sx={{ fontWeight: 700, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", minHeight: 15 }}
        >
          {badge ? t(CELL_BADGE_KEYS[badge]) : ""}
        </Typography>
        {join.wrapFromPrev ? (
          <ChevronLeft aria-hidden sx={{ position: "absolute", insetInlineStart: 0, fontSize: 14 }} />
        ) : null}
        {join.wrapToNext ? (
          <ChevronRight aria-hidden sx={{ position: "absolute", insetInlineEnd: 0, fontSize: 14 }} />
        ) : null}
      </ButtonBase>
      {selectable ? (
        <>
          <Checkbox
            size="small"
            checked={selected}
            onChange={() => onToggle(entry)}
            icon={<RadioButtonUnchecked fontSize="small" sx={{ color: "#9ca3af", bgcolor: "#ffffffb3", borderRadius: "50%" }} />}
            checkedIcon={<CheckCircle fontSize="small" sx={{ color: "primary.main", bgcolor: "#ffffff", borderRadius: "50%" }} />}
            slotProps={{ input: { "aria-label": t("web.month_grid.pick_month", { month: monthYear }) } }}
            sx={{ position: "absolute", top: 6, insetInlineStart: 6, p: 0.5 }}
          />
          <Box
            sx={{
              position: "absolute",
              top: 6,
              insetInlineEnd: 6,
              "& .MuiIconButton-root, & .MuiCircularProgress-root": { color: look.fg },
            }}
          >
            <RowActionsMenu rowLabel={monthYear} actions={menuActions(entry)} busy={busy} />
          </Box>
        </>
      ) : null}
    </Box>
  );
}
