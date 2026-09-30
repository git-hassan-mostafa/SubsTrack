import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { findCurrency, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import type { SharedBill } from "@shared/modules/ledger/utils/sharedBills";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

// Names the other bills a whole-hand-over void un-pays (#125).
export function SharedBillsWarning({ bills }: { bills: SharedBill[] }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  if (bills.length === 0) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {t("ledger.shared_void_explainer", { count: bills.length })}
      </Typography>
      <Paper variant="outlined" component="ul" sx={{ m: 0, px: 2, py: 1, listStyle: "none" }}>
        {bills.map((bill) => {
          const money = formatMoneyPair(bill.amount, snapshotCurrency(bill.snapshot, currencies), display);
          return (
            <Stack
              component="li"
              key={`${bill.chargeId}|${bill.snapshot.currencyId ?? "USD"}`}
              direction="row"
              spacing={2}
              sx={{ justifyContent: "space-between", alignItems: "baseline", py: 0.5 }}
            >
              <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                {bill.label}
              </Typography>
              <Typography variant="body2" color="error.main" sx={{ fontWeight: 600, flexShrink: 0 }}>
                {money.approx ? `${money.primary} · ${money.approx}` : money.primary}
              </Typography>
            </Stack>
          );
        })}
      </Paper>
    </Stack>
  );
}
