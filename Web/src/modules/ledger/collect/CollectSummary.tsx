import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { owedHeadlineKey } from "@shared/modules/ledger/utils/allocationRows";

interface CollectSummaryProps {
  amount: string;
  approx?: string | null;
  billCount: number;
}

// What the customer owes in one figure, at the top of the payment panel.
export function CollectSummary({ amount, approx, billCount }: CollectSummaryProps) {
  const { t } = useTranslation();
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2" color="text.secondary">
        {t(owedHeadlineKey(billCount), { count: billCount })}
      </Typography>
      <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
        {amount}
      </Typography>
      {approx ? (
        <Typography variant="body2" color="text.secondary">
          {approx}
        </Typography>
      ) : null}
    </Stack>
  );
}
