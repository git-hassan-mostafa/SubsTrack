import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { CollectionListItem } from "@shared/core/types";
import { findCurrency, formatMoney, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { collectionLabel } from "@shared/modules/ledger/utils/collectionLabel";
import { hasCollectionFilter } from "@shared/modules/ledger/utils/collectionFilters";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import { usePagedTable } from "@/shared/table/usePagedTable";
import { RowLink } from "@/shared/table/RowLink";
import type { TableAction } from "@/shared/table/tableAction";
import { useBranchColumn } from "@/shared/table/useBranchColumn";
import { useCollectionsTable } from "@/state/collectionsTable";
import { useSendCollectionReceipt } from "@/modules/invoicing/useSendCollectionReceipt";
import { useBillDialog } from "../bill/useBillDialog";
import { CorrectPaymentDialog } from "../payment/CorrectPaymentDialog";
import { KIND_ICON, KIND_TONE } from "../kindLook";
import { PaymentDetailDialog } from "../payment/PaymentDetailDialog";
import { paymentActions } from "../payment/paymentActions";
import { VoidPaymentsDialog } from "../void/VoidPaymentsDialog";
import { useSaleDoors } from "@/modules/transaction/sales/useSaleDoors";
import { MoneyReceivedFilters } from "./MoneyReceivedFilters";

const isVoided = (row: CollectionListItem) => row.voidedAt !== null;

const recipientOf = (row: CollectionListItem) =>
  row.customerPhone ? { name: row.customerName ?? "", phone: row.customerPhone } : null;

const rowTone = (row: CollectionListItem) => (isVoided(row) ? "muted" : null);

// Every hand-over of cash, server paged; a voided one stays listed and greyed.
export function MoneyReceivedPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const paged = usePagedTable(useCollectionsTable, branch);
  const periodTotalUsd = paged.meta;
  const query = paged.query;
  const setFilters = paged.setFilters;
  const reload = paged.reload;
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const branchColumn = useBranchColumn<CollectionListItem>(t("web.money_received.no_branch"));
  const sendReceipt = useSendCollectionReceipt();
  const sale = useSaleDoors({ onChanged: reload });
  const bill = useBillDialog({ onChanged: reload, onOpenSale: sale.openSale });
  const [detail, setDetail] = useState<CollectionListItem | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [voidRows, setVoidRows] = useState<CollectionListItem[] | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sendOne = useCallback(async (row: CollectionListItem) => {
    setActionError(null);
    setSendingId(row.id);
    try {
      const full = await collectionService.getById(row.id);
      if (full) {
        await sendReceipt({ name: row.customerName ?? "", phoneNumber: row.customerPhone }, full);
      }
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSendingId(null);
    }
  }, [sendReceipt]);

  const rowActions = useCallback((row: CollectionListItem): TableAction[] =>
    paymentActions(t, {
      onDetails: () => setDetail(row),
      onSend:
        !isVoided(row) && whatsAppChatUrl(row.customerPhone) !== null
          ? () => void sendOne(row)
          : undefined,
      onCorrect: isVoided(row) ? undefined : () => setCorrectId(row.id),
      onVoid: isVoided(row) ? undefined : () => setVoidRows([row]),
    }), [sendOne, t]);

  const bulkActions = useCallback((selected: CollectionListItem[]): TableAction[] => {
    const live = selected.filter((row) => !isVoided(row));
    if (live.length === 0) return [];
    return [
      {
        key: "void",
        group: "danger",
        label: t("ledger.void_payment"),
        icon: DeleteOutlined,
        destructive: true,
        onClick: () => setVoidRows(live),
      },
    ];
  }, [t]);

  const rowLabel = useCallback(
    (row: CollectionListItem) => `${row.customerName ?? t("ledger.walk_in")} · ${formatDateTime(row.receivedAt)}`,
    [t],
  );

  const rowBusy = useCallback((row: CollectionListItem) => sendingId === row.id, [sendingId]);

  const { openItem, loadingItemId } = bill;

  const columns = useMemo<GridColDef<CollectionListItem>[]>(() => {
    const openPaidFor = (row: CollectionListItem) => {
      const item = row.items[0];
      if (item) void openItem(item, row.itemLabels[0] || t("ledger.payment"), row.customerName, recipientOf(row));
    };
    return [
      {
        field: "receivedAt",
        headerName: t("ledger.received_at"),
        width: 170,
        renderCell: (params) => (
          <RowLink
            label={formatDateTime(params.row.receivedAt)}
            tabIndex={params.tabIndex}
            onClick={() => setDetail(params.row)}
          />
        ),
      },
      {
        field: "customerName",
        headerName: t("web.money_received.customer"),
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row) => row.customerName ?? t("ledger.walk_in"),
      },
      {
        field: "paidFor",
        headerName: t("web.money_received.paid_for"),
        flex: 1.2,
        minWidth: 200,
        renderCell: (params) => {
          const row = params.row;
          const label = collectionLabel(row, t);
          if (row.itemCount !== 1 || isVoided(row)) return label;
          if (loadingItemId === row.items[0]?.id) {
            return <CircularProgress size={18} aria-label={t("web.loading")} />;
          }
          return <RowLink label={label} tabIndex={params.tabIndex} onClick={() => openPaidFor(row)} />;
        },
      },
      {
        field: "kind",
        headerName: t("ledger.filter_by_type"),
        width: 130,
        renderCell: (params) => (
          <StatusChip
            tone={KIND_TONE[params.row.kind]}
            icon={KIND_ICON[params.row.kind]}
            label={t(`ledger.kind_${params.row.kind}`)}
          />
        ),
      },
      {
        field: "receivedByUserId",
        headerName: t("ledger.collected_by"),
        width: 150,
        valueGetter: (_value, row) => userName(row.receivedByUserId) ?? t("common.unknown"),
      },
      {
        field: "heldByUserId",
        headerName: t("ledger.held_by"),
        width: 170,
        valueGetter: (_value, row) => {
          if (isVoided(row)) return "";
          if (row.heldByUserId === null) return t("ledger.banked");
          return userName(row.heldByUserId) ?? t("common.unknown");
        },
      },
      ...(branchColumn ? [branchColumn] : []),
      {
        field: "amount",
        headerName: t("ledger.amount"),
        width: 170,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const money = formatMoneyPair(params.row.amount, snapshotCurrency(params.row, currencies), display);
          return isVoided(params.row) ? (
            <Box sx={{ textDecoration: "line-through", height: "100%" }}>
              <MoneyText primary={money.primary} approx={money.approx} />
            </Box>
          ) : (
            <MoneyText primary={money.primary} approx={money.approx} />
          );
        },
      },
      {
        field: "voidedAt",
        headerName: t("web.status"),
        width: 110,
        renderCell: (params) =>
          isVoided(params.row) ? (
            <Tooltip title={params.row.voidReason ?? ""}>
              <span>
                <StatusChip tone="red" label={t("ledger.voided")} />
              </span>
            </Tooltip>
          ) : null,
      },
    ];
  }, [branchColumn, currencies, display, loadingItemId, openItem, t, userName]);

  return (
    <Stack spacing={2}>
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
      <ErrorBanner message={sale.error} onDismiss={sale.clearError} />
      <ErrorBanner message={sale.notice} onDismiss={sale.clearNotice} severity="info" />
      <DataTable<CollectionListItem>
        label={t("ledger.history_title")}
        columns={columns}
        {...paged.tableProps}
        search={{
          ...paged.search,
          placeholder: t("web.money_received.search"),
        }}
        filters={<MoneyReceivedFilters value={query.filters} onChange={setFilters} />}
        summary={
          periodTotalUsd === null ? null : (
            <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary">
                {t("ledger.total_in_period")}
              </Typography>
              <Typography sx={{ fontWeight: 700, color: "success.main" }}>
                {formatMoney(periodTotalUsd, null, display)}
              </Typography>
            </Stack>
          )
        }
        rowLabel={rowLabel}
        rowActions={rowActions}
        rowBusy={rowBusy}
        rowTone={rowTone}
        bulkActions={bulkActions}
        empty={{ title: t("payments.no_payments"), hint: t("web.money_received.empty_hint") }}
        filtered={!!query.search || hasCollectionFilter(query.filters)}
      />
      {detail ? (
        <PaymentDetailDialog
          collectionId={detail.id}
          initial={detail}
          onClose={() => setDetail(null)}
          onOpenItem={(item, label, customerName) =>
            void bill.openItem(item, label, customerName, recipientOf(detail))
          }
          loadingItemId={bill.loadingItemId}
        />
      ) : null}
      {correctId ? (
        <CorrectPaymentDialog
          collectionId={correctId}
          onDone={() => {
            setCorrectId(null);
            reload();
          }}
          onClose={() => setCorrectId(null)}
        />
      ) : null}
      {voidRows ? (
        <VoidPaymentsDialog
          payments={voidRows}
          onDone={() => {
            setVoidRows(null);
            reload();
          }}
          onClose={() => setVoidRows(null)}
        />
      ) : null}
      {bill.dialog}
      {sale.dialogs}
    </Stack>
  );
}
