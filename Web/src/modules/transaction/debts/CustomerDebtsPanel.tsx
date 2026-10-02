import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Charge, Customer, OpenItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  formatPaidFraction,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { useWriteOffActions, writeOffTargetOf } from "@shared/modules/ledger/hooks/useWriteOffActions";
import { owedUsd } from "@shared/modules/ledger/utils/debtRule";
import { openItemFromCharge } from "@shared/modules/ledger/utils/openItems";
import { useCustomerDebts } from "@shared/modules/transaction/debts/hooks/useCustomerDebts";
import { useRemoveCustomDebt } from "@shared/modules/transaction/debts/hooks/useRemoveCustomDebt";
import { useWrittenOffDebts, type DebtScope } from "@shared/modules/transaction/debts/hooks/useWrittenOffDebts";
import { sortDebts } from "@shared/modules/transaction/debts/utils/allDebtsFilter";
import {
  debtItemActions,
  debtItemFacts,
  type DebtItemActionKey,
} from "@shared/modules/transaction/debts/utils/debtItemView";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { PanelSection } from "@/shared/components/PanelSection";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBillDialog } from "@/modules/ledger/bill/useBillDialog";
import { useCollectDialog } from "@/modules/ledger/collect/useCollectDialog";
import { KIND_ICON, KIND_TONE } from "@/modules/ledger/kindLook";
import { useSaleDoors } from "@/modules/transaction/sales/useSaleDoors";
import { DEBT_ACTION_ICONS } from "./debtActionIcons";

type DebtRow = OpenItem & { id: string };

function rowId(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

// Plain unpaid months stay out: the months above already show them.
export function CustomerDebtsPanel({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const debts = useCustomerDebts(customer.id, customer.name);
  const writtenOff = useWrittenOffDebts(customer.id, customer.name);
  const writeOffActions = useWriteOffActions();
  const removeCustomDebt = useRemoveCustomDebt();
  const collect = useCollectDialog();
  const [scope, setScope] = useState<DebtScope>("live");
  const { refresh } = debts;
  const recipient = { name: customer.name, phone: customer.phoneNumber };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const writeOff = (charge: Charge, balance: number) =>
    void writeOffActions.writeOff(writeOffTargetOf(charge, balance, customer.name));

  const sale = useSaleDoors();
  const bill = useBillDialog({
    onOpenSale: sale.openSale,
    doors: {
      onCollect: (charge, balance) => {
        const label = debts.items.find((item) => item.chargeId === charge.id)?.label ?? "";
        collect.openOne(customer.name, openItemFromCharge(charge, charge.amount - balance, label, customer.name));
      },
      onWriteOff: writeOff,
      onRevertWriteOff: (charge, balance) =>
        writeOffActions.revert(writeOffTargetOf(charge, balance, customer.name)),
    },
  });

  const showingWrittenOff = scope === "written_off";
  const source = showingWrittenOff ? writtenOff : debts;
  const rows: DebtRow[] = sortDebts(source.items).map((item) => ({ ...item, id: rowId(item) }));
  const live = debts.items;

  const run: Partial<Record<DebtItemActionKey, (item: OpenItem) => void>> = {
    collect: (item) => collect.openOne(customer.name, item),
    revert_write_off: (item) => void writeOffActions.revert(item),
    write_off: (item) => void writeOffActions.writeOff(item),
    remove: (item) => void removeCustomDebt(item),
  };

  const rowActions = (item: DebtRow): TableAction[] =>
    debtItemActions(item).flatMap((entry) => {
      const handler = run[entry.key];
      if (!handler) return [];
      return [
        {
          key: entry.key,
          group: entry.group,
          label: t(entry.labelKey),
          caption: entry.captionKey ? t(entry.captionKey) : undefined,
          icon: DEBT_ACTION_ICONS[entry.key],
          destructive: entry.destructive,
          onClick: () => handler(item),
        },
      ];
    });

  const columns: GridColDef<DebtRow>[] = [
    {
      field: "label",
      headerName: t("web.customer_detail.bill_column"),
      flex: 1.4,
      minWidth: 180,
      renderCell: (params) =>
        params.row.chargeId ? (
          <RowLink
            label={params.row.label}
            tabIndex={params.tabIndex}
            onClick={() => void bill.openOwed(params.row, recipient)}
          />
        ) : (
          params.row.label
        ),
    },
    {
      field: "kind",
      headerName: t("web.customer_detail.type_column"),
      width: 160,
      renderCell: (params) => (
        <StatusChip
          label={t(`web.bill.kind_${params.row.kind}`)}
          tone={KIND_TONE[params.row.kind]}
          icon={KIND_ICON[params.row.kind]}
        />
      ),
    },
    {
      field: "dueDate",
      headerName: t("ledger.due_date"),
      width: 130,
      valueGetter: (_value, row) => formatDate(row.dueDate),
    },
    {
      field: "status",
      headerName: t("customers.status_label"),
      flex: 1,
      minWidth: 180,
      renderCell: (params) => <DebtChips item={params.row} />,
    },
    {
      field: "balance",
      headerName: t("web.customer_detail.still_owed"),
      width: 150,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => {
        const money = formatMoneyPair(params.row.balance, snapshotCurrency(params.row, currencies), display);
        return <MoneyText primary={money.primary} approx={money.approx} />;
      },
    },
  ];

  const headerActions =
    !showingWrittenOff && live.length > 0 ? (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography sx={{ fontWeight: 700 }}>
          {t("web.customer_detail.owed_total", { amount: formatMoney(owedUsd(live), null, display) })}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<PaymentsOutlined />}
          onClick={() => collect.open(customer.id, customer.name, live)}
        >
          {t("ledger.collect_all")}
        </Button>
        <RowActionsMenu
          rowLabel={t("debts.customer_panel_title")}
          actions={[
            {
              key: "write-off-all",
              group: "danger",
              label: t("ledger.write_off_all"),
              caption: t("ledger.write_off_all_caption"),
              icon: RemoveCircleOutlineOutlined,
              destructive: true,
              onClick: () => void writeOffActions.writeOffAll(customer.name, live),
            },
          ]}
        />
      </Stack>
    ) : null;

  return (
    <PanelSection title={t("debts.customer_panel_title")} actions={headerActions}>
      <ErrorBanner message={debts.error} onDismiss={debts.clearError} />
      <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
      <ErrorBanner message={sale.error} onDismiss={sale.clearError} />
      <ErrorBanner message={sale.notice} onDismiss={sale.clearNotice} severity="info" />
      <Paper variant="outlined">
        <Tabs
          value={scope}
          onChange={(_event, next: DebtScope) => setScope(next)}
          aria-label={t("web.customer_detail.debt_scope")}
        >
          <Tab value="live" label={t("debts.scope_live")} />
          <Tab value="written_off" label={t("debts.scope_written_off")} />
        </Tabs>
      </Paper>
      {source.loading && rows.length === 0 ? (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress aria-label={t("web.loading")} />
        </Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, px: 2, textAlign: "center" }}>
          <Typography color="text.secondary">
            {showingWrittenOff ? t("debts.no_written_off") : t("web.customer_detail.no_debts")}
          </Typography>
        </Paper>
      ) : (
        <LocalTable<DebtRow>
          label={t("debts.customer_panel_title")}
          columns={columns}
          rows={rows}
          rowLabel={(row) => row.label}
          rowActions={rowActions}
          rowBusy={(row) => bill.loadingItemId === row.id}
          rowTone={(row) => (row.charge?.writtenOffAt ? "muted" : null)}
          autoRowHeight
        />
      )}
      {collect.dialog}
      {bill.dialog}
      {sale.dialogs}
    </PanelSection>
  );
}

// A chip means something is wrong with the bill, so a clean row shows none.
function DebtChips({ item }: { item: OpenItem }) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const facts = debtItemFacts(item);
  const source = snapshotCurrency(item, currencies);
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      {facts.daysLate > 0 ? (
        <StatusChip label={t("ledger.days_late", { count: facts.daysLate })} tone="red" />
      ) : null}
      {facts.partlyPaid ? (
        <StatusChip label={formatPaidFraction(item.paid, item.amount, source, source)} tone="amber" />
      ) : null}
      {facts.writtenOff ? <StatusChip label={t("ledger.written_off")} tone="orange" /> : null}
    </Stack>
  );
}
