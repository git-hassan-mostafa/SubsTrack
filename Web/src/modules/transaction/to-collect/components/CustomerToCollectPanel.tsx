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
import { customerOwedItems, customerOwedUsd } from "@shared/modules/ledger/utils/owedView";
import { useDebtScope } from "@shared/modules/transaction/debts/hooks/useDebtScope";
import { useCustomerToCollect } from "@shared/modules/transaction/to-collect/hooks/useCustomerToCollect";
import { owingCustomerActions } from "@shared/modules/transaction/to-collect/utils/toCollectView";
import { sortOwed } from "@shared/modules/transaction/to-collect/utils/allItemsFilter";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { PanelSection } from "@/shared/components/PanelSection";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { toTableActions } from "@/shared/table/tableAction";
import { DebtScopeTabs } from "../../debts/components/DebtScopeTabs";
import { OWING_CUSTOMER_ACTION_ICONS } from "../utils/owedActionIcons";
import { useOwedDoors } from "../hooks/useOwedDoors";
import { OwedItemsTable } from "./OwedItemsTable";

// The same rows as this customer's dialog on the To collect page.
export function CustomerToCollectPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const display = useDisplayCurrency();
  const toCollect = useCustomerToCollect(customer);
  const { scope, setScope, showingWrittenOff, writtenOff } = useDebtScope(customer.id, customer.name);
  const { refresh, entry } = toCollect;
  const recipientOf = useCallback(() => customerRecipient(customer), [customer]);
  const doors = useOwedDoors({ recipientOf });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const owed = customerOwedItems(entry);
  const source = showingWrittenOff ? writtenOff : { ...toCollect, items: owed };
  const owing = !showingWrittenOff && owed.length > 0;

  const headerActions = (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {owing ? (
        <Typography sx={{ fontWeight: 700 }}>
          {t("web.customer_detail.owed_total", { amount: formatMoney(customerOwedUsd(entry), null, display) })}
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
            onClick={() => doors.collectAll(customer.id, customer.name, owed)}
          >
            {t("ledger.collect_all")}
          </Button>
          <RowActionsMenu
            rowLabel={t("customers.to_collect")}
            actions={toTableActions(owingCustomerActions(owed), t, {
              icons: OWING_CUSTOMER_ACTION_ICONS,
              run: { write_off_all: () => doors.writeOffAll(customer.name, owed) },
            })}
          />
        </>
      ) : null}
    </Stack>
  );

  return (
    <PanelSection title={t("customers.to_collect")} actions={headerActions}>
      <ErrorBanner message={source.error} onDismiss={source.clearError} />
      {doors.banners}
      <DebtScopeTabs value={scope} onChange={setScope} />
      <OwedItemsTable
        viewKey="customer-to-collect"
        label={t("customers.to_collect")}
        items={sortOwed(source.items)}
        doors={doors}
        loading={source.loading}
        emptyText={showingWrittenOff ? t("debts.no_written_off") : t("debts.no_debtors")}
      />
      {doors.dialogs}
    </PanelSection>
  );
}
