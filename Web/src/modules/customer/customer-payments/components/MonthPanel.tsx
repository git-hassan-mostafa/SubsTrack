import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import type { Collection, Customer, MonthEntry } from "@shared/core/types";
import { billingMonthLabel } from "@shared/core/utils/billingMonth";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { customerRecipient } from "@shared/modules/invoicing/utils/invoiceRecipient";
import { useCustomerMonthGrid } from "@shared/modules/customer/customer-payments/hooks/useCustomerMonthGrid";
import { EmptyState } from "@/shared/components/EmptyState";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { BillHistoryDialog } from "@/modules/admin/audit/components/RecordHistoryDialog";
import { useSendCollectionReceipt } from "@/modules/invoicing/hooks/useSendCollectionReceipt";
import { BillDialog } from "@/modules/ledger/bill/components/BillDialog";
import { useCollectDialog } from "@/modules/ledger/collect/hooks/useCollectDialog";
import { VoidBillDialog } from "@/modules/ledger/void/components/VoidBillDialog";
import { LineTabs } from "./LineTabs";
import { MONTH_MENU_ICONS } from "../utils/monthGridIcons";
import { SkipMonthsDialog } from "./SkipMonthsDialog";
import { YearCard } from "./YearCard";

const QUICK_PAY_PARAM = "quickPay";

// The customer's months, one service line at a time; every rule is Shared's.
export function MonthPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const sendCollectionReceipt = useSendCollectionReceipt();
  const sendable = canSendWhatsApp(customer.phoneNumber);

  const collect = useCollectDialog({
    onCollected: (collections) => void grid.collected(collections),
  });

  const consumeQuickPay = useCallback(
    () =>
      setSearchParams(
        (params) => {
          params.delete(QUICK_PAY_PARAM);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const grid = useCustomerMonthGrid({
    customer,
    canSend: sendable,
    openCollect: (items, single) =>
      single ? collect.openOne(customer.name, items[0]) : collect.open(customer.id, customer.name, items),
    sendReceipt: (collection: Collection) => sendCollectionReceipt(customer, collection),
    quickPayLink: { requested: searchParams.get(QUICK_PAY_PARAM) === "1", consume: consumeQuickPay },
  });
  const { selectedLine } = grid;

  const menuActions = (entry: MonthEntry): TableAction[] =>
    toTableActions(grid.menuItems(entry), t, {
      icons: MONTH_MENU_ICONS,
      run: (key) => grid.runMenu(key, entry),
    });

  const dialogOpen = !!collect.dialog || !!grid.voidRequest || !!grid.skipRequest;
  const error = dialogOpen ? null : (grid.paymentsError ?? grid.ledgerError);
  const banner = grid.unpaidBanner;
  const bill = grid.bill;
  const voidRequest = grid.voidRequest;

  if (grid.lines.length === 0) {
    return (
      <Paper variant="outlined">
        <EmptyState title={t("subscriptions.empty")} />
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      <ErrorBanner message={error} onDismiss={grid.clearErrors} />
      <LineTabs
        lines={grid.lines}
        selectedId={selectedLine?.id ?? null}
        indicatorOf={grid.indicatorOf}
        onSelect={grid.selectLine}
      />
      <YearCard grid={grid} menuActions={menuActions} />
      {banner ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              variant="outlined"
              disabled={grid.busyMonth === banner.billingMonth}
              startIcon={
                grid.busyMonth === banner.billingMonth ? <CircularProgress size={14} color="inherit" /> : undefined
              }
              onClick={() => void grid.quickPay(banner)}
            >
              {t("payments.collect")}
            </Button>
          }
        >
          {t("web.month_grid.unpaid_banner", { month: billingMonthLabel(banner.billingMonth) })}
        </Alert>
      ) : null}

      {collect.dialog}

      {bill?.charge ? (
        <BillDialog
          charge={bill.charge}
          label={grid.monthLabelOf(bill)}
          customerName={customer.name}
          recipient={customerRecipient(customer)}
          onClose={grid.closeBill}
          onCollect={grid.collectFromBill}
          onVoidBill={grid.voidFromBill}
          onWriteOff={grid.writeOffFromBill}
          onRevertWriteOff={grid.revertWriteOff}
        />
      ) : null}

      {voidRequest?.charge ? (
        <VoidBillDialog
          chargeIds={[voidRequest.charge.id]}
          title={t("ledger.void_month_title")}
          message={t("ledger.void_month_message", { month: grid.monthLabelOf(voidRequest) })}
          confirmLabel={t("ledger.void_month")}
          error={grid.ledgerError}
          onDismissError={grid.clearErrors}
          onConfirm={grid.confirmVoid}
          onClose={grid.closeVoid}
        />
      ) : null}

      {grid.history ? (
        <BillHistoryDialog
          chargeId={grid.history.chargeId}
          targets={grid.history.targets}
          name={grid.history.subtitle}
          onClose={grid.closeHistory}
        />
      ) : null}

      {grid.skipRequest && selectedLine ? (
        <SkipMonthsDialog
          entries={grid.skipRequest.entries}
          mode={grid.skipRequest.mode}
          customerId={customer.id}
          lineId={selectedLine.id}
          onDone={grid.skipDone}
          onClose={grid.closeSkip}
        />
      ) : null}
    </Stack>
  );
}
