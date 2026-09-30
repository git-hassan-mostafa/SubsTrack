import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Currency, OpenItem } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import type { CurrencyPlan } from "@shared/modules/ledger/utils/currencyGroups";
import { CurrencyInput } from "@/shared/components/CurrencyInput";
import { AllocationPreview } from "./AllocationPreview";

interface CurrencyCollectSectionProps {
  plan: CurrencyPlan;
  currencies: Currency[];
  display: Currency | null;
  excluded: ReadonlySet<string>;
  grouped: boolean;
  onChangeAmount: (amount: number | null) => void;
  onToggle: (item: OpenItem) => void;
}

// Typed in the currency's OWN units: this section becomes one hand-over (#108b).
export function CurrencyCollectSection({
  plan,
  currencies,
  display,
  excluded,
  grouped,
  onChangeAmount,
  onToggle,
}: CurrencyCollectSectionProps) {
  const { t } = useTranslation();
  const money = (value: number) => formatMoney(value, plan.currency, plan.currency);
  const collecting = plan.lines.reduce((sum, l) => sum + l.amount, 0);
  const code = plan.currency?.code ?? "USD";
  const approx = (plan.currencyId ?? null) === (display?.id ?? null)
    ? null
    : `≈ ${formatMoney(plan.owed, plan.currency, display)}`;
  const overBy = plan.leftover > 0
    ? plan.skippedCount > 0
      ? t("ledger.over_by_skipped", { count: plan.skippedCount, max: money(plan.payable) })
      : t("ledger.over_by", { max: money(plan.payable) })
    : null;

  const body = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: 1 }}>
          <CurrencyInput
            label={grouped ? t("ledger.amount_received_in", { currency: code }) : t("ledger.amount")}
            amount={plan.amount}
            currencyId={plan.currencyId}
            currencies={currencies}
            lockCurrency
            error={overBy}
            onChange={(next) => onChangeAmount(next.amount)}
          />
        </Box>
        <Button onClick={() => onChangeAmount(plan.owed)} sx={{ mt: 1, flexShrink: 0 }}>
          {t("ledger.collect_all")}
        </Button>
      </Stack>
      <AllocationPreview
        items={plan.items}
        lines={plan.lines}
        excluded={excluded}
        onToggle={onToggle}
        money={money}
        remainingAfter={plan.owed - collecting}
      />
    </Stack>
  );

  if (!grouped) return body;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 2, gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {code}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {[t("ledger.amount_owed", { amount: money(plan.owed) }), approx].filter(Boolean).join(" · ")}
        </Typography>
      </Stack>
      {body}
    </Paper>
  );
}
