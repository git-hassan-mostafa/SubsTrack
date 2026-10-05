import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NoteAddOutlined from "@mui/icons-material/NoteAddOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import type { Customer } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { customerRecipient } from "@shared/modules/invoicing/utils/invoiceRecipient";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import { useCustomerDebts } from "@shared/modules/transaction/debts/hooks/useCustomerDebts";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import { debtorActions } from "@shared/modules/transaction/debts/utils/debtorView";
import { sortDebts } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { PanelSection } from "@/shared/components/PanelSection";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { toTableActions } from "@/shared/table/tableAction";
import { DEBTOR_ACTION_ICONS } from "./debtActionIcons";
import { DebtItemsTable } from "./DebtItemsTable";
import { DebtScopeTabs } from "./DebtScopeTabs";
import { useDebtDoors } from "./useDebtDoors";

// Plain unpaid months stay out: the months above already show them.
export function CustomerDebtsPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const debts = useCustomerDebts(customer.id, customer.name);
  const { scope, setScope, showingWrittenOff, writtenOff } = useDebtScope(customer.id, customer.name);
  const { refresh } = debts;
  const recipientOf = useCallback(() => customerRecipient(customer), [customer]);
  const doors = useDebtDoors({ recipientOf });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const source = showingWrittenOff ? writtenOff : debts;
  const live = debts.items;
  const owing = !showingWrittenOff && live.length > 0;

  const headerActions = (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {owing ? (
        <Typography sx={{ fontWeight: 700 }}>
          {t("web.customer_detail.owed_total", { amount: formatMoney(owedUsd(live), null, display) })}
        </Typography>
      ) : null}
      <Button variant="outlined" startIcon={<NoteAddOutlined />} onClick={() => doors.addCustomDebt(customer)}>
        {t("debts.add_custom_debt")}
      </Button>
      {owing ? (
        <>
          <Button
            variant="outlined"
            startIcon={<PaymentsOutlined />}
            onClick={() => doors.collectAll(customer.id, customer.name, live)}
          >
            {t("ledger.collect_all")}
          </Button>
          <RowActionsMenu
            rowLabel={t("debts.customer_panel_title")}
            actions={toTableActions(debtorActions(live), t, {
              icons: DEBTOR_ACTION_ICONS,
              run: { write_off_all: () => doors.writeOffAll(customer.name, live) },
            })}
          />
        </>
      ) : null}
    </Stack>
  );

  return (
    <PanelSection title={t("debts.customer_panel_title")} actions={headerActions}>
      <ErrorBanner message={source.error} onDismiss={source.clearError} />
      {doors.banners}
      <DebtScopeTabs value={scope} onChange={setScope} />
      <DebtItemsTable
        label={t("debts.customer_panel_title")}
        items={sortDebts(source.items)}
        doors={doors}
        loading={source.loading}
        emptyText={showingWrittenOff ? t("debts.no_written_off") : t("web.customer_detail.no_debts")}
      />
      {doors.dialogs}
    </PanelSection>
  );
}
