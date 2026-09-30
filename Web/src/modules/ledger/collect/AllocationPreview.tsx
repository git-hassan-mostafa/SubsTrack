import { useId } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AllocationLine, OpenItem } from "@shared/core/types";
import { daysLate, formatDate } from "@shared/core/utils/date";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { StatusChip, type ChipTone } from "@/shared/components/StatusChip";

interface AllocationPreviewProps {
  items: OpenItem[];
  lines: AllocationLine[];
  excluded: ReadonlySet<string>;
  onToggle?: (item: OpenItem) => void;
  money: (value: number) => string;
  remainingAfter: number;
}

interface RowProps {
  item: OpenItem;
  line: AllocationLine | undefined;
  position: number | undefined;
  skipped: boolean;
  money: (value: number) => string;
}

// The number IS the queue: filled once money reaches the bill, hollow before.
function QueueNumber({ position, funded }: { position: number | undefined; funded: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 26,
        height: 26,
        flexShrink: 0,
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

function statusOf(skipped: boolean, line: AllocationLine | undefined): { tone: ChipTone; key: string } | null {
  if (skipped) return { tone: "gray", key: "ledger.skipped_bill" };
  if (!line) return null;
  return line.settles ? { tone: "emerald", key: "ledger.pays_in_full" } : { tone: "amber", key: "ledger.leaves_owing" };
}

function BillRow({ item, line, position, skipped, money }: RowProps) {
  const { t } = useTranslation();
  const late = daysLate(item.dueDate);
  const status = statusOf(skipped, line);
  const due = [
    t("ledger.due_on", { date: formatDate(item.dueDate) }),
    late > 0 ? t("ledger.days_late", { count: late }) : null,
    !line && !skipped ? t("ledger.amount_owed", { amount: money(item.balance) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", width: "100%", opacity: skipped ? 0.6 : 1 }}>
      <QueueNumber position={position} funded={Boolean(line)} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {item.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {due}
        </Typography>
      </Box>
      <Stack sx={{ alignItems: "flex-end", gap: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {money(line?.amount ?? 0)}
        </Typography>
        {status ? (
          <StatusChip
            tone={status.tone}
            label={t(status.key, { amount: line ? money(item.balance - line.amount) : "" })}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}

// The split in the waterfall's own order; untick a bill to send the money past it.
export function AllocationPreview({
  items,
  lines,
  excluded,
  onToggle,
  money,
  remainingAfter,
}: AllocationPreviewProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const byKey = new Map(lines.map((l) => [keyOf(l.item), l]));
  const positions = new Map<string, number>();
  for (const item of items) {
    if (!excluded.has(keyOf(item))) positions.set(keyOf(item), positions.size + 1);
  }
  const toggleable = Boolean(onToggle) && items.length > 1;

  return (
    <Box>
      <Typography
        id={titleId}
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", lineHeight: 1.6 }}
      >
        {t("ledger.this_pays")}
      </Typography>
      {toggleable ? (
        <Typography variant="caption" color="text.secondary">
          {t("web.collect.skip_hint")}
        </Typography>
      ) : null}
      <List dense disablePadding aria-labelledby={titleId}>
        {items.map((item) => {
          const key = keyOf(item);
          const skipped = excluded.has(key);
          const row = (
            <BillRow
              item={item}
              line={byKey.get(key)}
              position={positions.get(key)}
              skipped={skipped}
              money={money}
            />
          );
          return (
            <ListItem key={key} disablePadding divider>
              {toggleable ? (
                <Box
                  component="label"
                  sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, width: "100%", cursor: "pointer" }}
                >
                  <Checkbox
                    checked={!skipped}
                    onChange={() => onToggle?.(item)}
                    slotProps={{ input: { "aria-label": t("web.collect.pay_this_bill", { name: item.label }) } }}
                  />
                  {row}
                </Box>
              ) : (
                <Box sx={{ px: 1, py: 1, width: "100%" }}>{row}</Box>
              )}
            </ListItem>
          );
        })}
      </List>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", pt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {t("ledger.still_owed_after")}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {money(Math.max(0, remainingAfter))}
        </Typography>
      </Stack>
    </Box>
  );
}
