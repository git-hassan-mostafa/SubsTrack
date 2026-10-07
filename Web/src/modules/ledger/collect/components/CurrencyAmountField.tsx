import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import type { Currency } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { overByText } from "@shared/modules/ledger/utils/allocationRows";
import type { CurrencyPlan } from "@shared/modules/ledger/utils/currencyGroups";
import { CurrencyInput } from "@/shared/components/CurrencyInput";

interface CurrencyAmountFieldProps {
  plan: CurrencyPlan;
  currencies: Currency[];
  grouped: boolean;
  onChangeAmount: (amount: number | null) => void;
}

// Typed in the currency's OWN units: each box becomes one hand-over (#108b).
export function CurrencyAmountField({ plan, currencies, grouped, onChangeAmount }: CurrencyAmountFieldProps) {
  const { t } = useTranslation();
  const money = (value: number) => formatMoney(value, plan.currency, plan.currency);
  const code = plan.currency?.code ?? "USD";
  const overBy = overByText(plan, money, t);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
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
  );
}
