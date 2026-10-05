import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { AllocationLine, OpenItem } from "@shared/core/types";
import { daysLate, formatDate } from "@shared/core/utils/date";
import { allocationRows } from "@shared/modules/ledger/utils/allocationRows";
import { StatusChip } from "@/shared/components/StatusChip";

interface BillsTableProps {
  title: string;
  caption?: string;
  items: OpenItem[];
  lines: AllocationLine[];
  excluded: ReadonlySet<string>;
  onToggle?: (item: OpenItem) => void;
  money: (value: number) => string;
  remainingAfter: number;
}

// The number IS the queue: filled once money reaches the bill, hollow before.
function QueueNumber({ position, funded }: { position: number | null; funded: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        bgcolor: funded ? "primary.main" : "transparent",
        color: funded ? "primary.contrastText" : "text.disabled",
        border: funded ? "none" : "1px solid",
        borderColor: "divider",
      }}
    >
      {position ?? "–"}
    </Box>
  );
}

// One currency's bills in the waterfall's own order; untick one to send the money past it.
export function BillsTable({
  title,
  caption,
  items,
  lines,
  excluded,
  onToggle,
  money,
  remainingAfter,
}: BillsTableProps) {
  const { t } = useTranslation();
  const rows = allocationRows(items, lines, excluded);
  const toggleable = !!onToggle && items.length > 1;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
        {caption ? (
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        ) : null}
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow>
              {toggleable ? <TableCell padding="checkbox" /> : null}
              <TableCell sx={{ width: 40 }} />
              <TableCell>{t("web.collect.bill_column")}</TableCell>
              <TableCell>{t("ledger.due_date")}</TableCell>
              <TableCell align="right">{t("ledger.owed")}</TableCell>
              <TableCell align="right">{t("web.collect.paying_column")}</TableCell>
              <TableCell sx={{ width: 170 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const { item, line, skipped } = row;
              const late = daysLate(item.dueDate);
              return (
                <TableRow key={row.key} sx={{ opacity: skipped ? 0.55 : 1 }}>
                  {toggleable ? (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={!skipped}
                        onChange={() => onToggle?.(item)}
                        slotProps={{ input: { "aria-label": t("web.collect.pay_this_bill", { name: item.label }) } }}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <QueueNumber position={row.position} funded={Boolean(line)} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{item.label}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(item.dueDate)}</Typography>
                    {late > 0 ? (
                      <Typography variant="caption" color="error.main">
                        {t("ledger.days_late", { count: late })}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">{money(item.balance)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {line ? money(line.amount) : (
                      <Typography component="span" variant="body2" color="text.disabled">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.statusKey ? (
                      <StatusChip tone={row.tone} label={t(row.statusKey, { amount: money(row.leavesOwing) })} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Stack
          direction="row"
          spacing={2}
          sx={{ justifyContent: "flex-end", px: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}
        >
          <Typography variant="body2" color="text.secondary">
            {t("ledger.still_owed_after")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {money(remainingAfter)}
          </Typography>
        </Stack>
      </TableContainer>
    </Stack>
  );
}
