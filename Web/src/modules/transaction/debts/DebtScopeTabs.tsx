import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import type { DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";

interface DebtScopeTabsProps {
  value: DebtScope;
  onChange: (scope: DebtScope) => void;
}

// Written-off bills are a separate read, never part of a "still owed" total.
export function DebtScopeTabs({ value, onChange }: DebtScopeTabsProps) {
  const { t } = useTranslation();
  return (
    <Paper variant="outlined">
      <Tabs
        value={value}
        onChange={(_event, next: DebtScope) => onChange(next)}
        aria-label={t("web.customer_detail.debt_scope")}
      >
        <Tab value="live" label={t("debts.scope_live")} />
        <Tab value="written_off" label={t("debts.scope_written_off")} />
      </Tabs>
    </Paper>
  );
}
