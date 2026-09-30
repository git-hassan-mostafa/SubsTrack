import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { StatusChip } from "@/shared/components/StatusChip";

interface CollectSummaryProps {
  amount: string;
  approx?: string | null;
  billCount: number;
}

// What the dialog is about, in one figure — the phone's CollectHero.
export function CollectSummary({ amount, approx, billCount }: CollectSummaryProps) {
  const { t } = useTranslation();
  return (
    <Stack spacing={0.75} sx={{ alignItems: "center", py: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography variant="h4" component="p" sx={{ fontWeight: 700 }}>
          {amount}
        </Typography>
        {approx ? (
          <Typography variant="body2" color="text.secondary">
            {approx}
          </Typography>
        ) : null}
      </Stack>
      <StatusChip
        tone="red"
        label={billCount > 1 ? t("ledger.owed_bills", { count: billCount }) : t("ledger.owed")}
      />
    </Stack>
  );
}
