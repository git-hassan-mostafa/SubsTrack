import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { UserWalletDetail, WalletItem, WalletSource } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import { KIND_TONE } from "@shared/modules/ledger/utils/collectionKind";
import { useWalletActions } from "@shared/modules/wallet/hooks/useWalletActions";
import { useWalletItemFilters } from "@shared/modules/wallet/hooks/useWalletItemFilters";
import {
  WALLET_SOURCE_LABEL_KEY,
  WALLET_SOURCES,
  walletActionMode,
  walletActLabelKey,
  walletItemMenuItems,
  walletSelectionItems,
} from "@shared/modules/wallet/utils/walletView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { DateField } from "@/shared/components/DateField";
import { MoneyText } from "@/shared/components/MoneyText";
import { StatusChip } from "@/shared/components/StatusChip";
import { DataTable } from "@/shared/table/DataTable";
import { FilterSelect } from "@/shared/table/FilterSelect";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useRowsPage } from "@/shared/table/useRowsPage";
import { KIND_ICON } from "@/modules/ledger/kindLook";
import { PaymentDetailDialog } from "@/modules/ledger/payment/PaymentDetailDialog";
import { WALLET_ITEM_ACTION_ICONS } from "./walletLook";

interface WalletDetailProps {
  detail: UserWalletDetail | null;
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
  onReload: () => void;
  onEmptied?: () => void;
}

// One holder's cash, hand-over by hand-over; what may be done comes from custody.ts.
export function WalletDetail({
  detail,
  loading,
  error,
  onDismissError,
  onReload,
  onEmptied,
}: WalletDetailProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const userName = useUserNames();
  const { busyHolderId, actOnItems, actOnAll } = useWalletActions();
  const items = useMemo(() => detail?.items ?? [], [detail]);
  const filters = useWalletItemFilters(items, detail?.holderUserId ?? null);
  const paging = useRowsPage(filters.rows);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const mode = walletActionMode(detail);
  const busy = busyHolderId !== null;
  const { toFirstPage } = paging;

  const filterBy = (patch: Parameters<typeof filters.set>[0]) => {
    toFirstPage();
    filters.set(patch);
  };

  const clearFilters = () => {
    toFirstPage();
    filters.clear();
  };

  const actAll = async () => {
    if (detail && (await actOnAll(detail))) onEmptied?.();
  };

  const rowActions = useCallback(
    (row: WalletItem): TableAction[] =>
      toTableActions(walletItemMenuItems(mode), t, {
        icons: WALLET_ITEM_ACTION_ICONS,
        run: {
          details: () => setOpenedId(row.id),
          act: () => {
            if (detail) void actOnItems(detail, [row]);
          },
        },
        disabled: busy ? ["act"] : undefined,
      }),
    [actOnItems, busy, detail, mode, t],
  );

  const bulkActions =
    mode === "view"
      ? undefined
      : (selected: WalletItem[]): TableAction[] =>
          toTableActions(walletSelectionItems(mode), t, {
            icons: WALLET_ITEM_ACTION_ICONS,
            run: {
              act: () => {
                if (detail) void actOnItems(detail, selected);
              },
            },
            disabled: busy,
          });

  const rowLabel = useCallback(
    (row: WalletItem) => `${row.customerName ?? t("wallet.walk_in")} · ${formatDateTime(row.date)}`,
    [t],
  );

  const columns = useMemo<GridColDef<WalletItem>[]>(
    () => [
      {
        field: "date",
        headerName: t("ledger.received_at"),
        width: 170,
        renderCell: (params) => (
          <RowLink
            label={formatDateTime(params.row.date)}
            tabIndex={params.tabIndex}
            onClick={() => setOpenedId(params.row.id)}
          />
        ),
      },
      {
        field: "customerName",
        headerName: t("web.money_received.customer"),
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row) => row.customerName ?? t("wallet.walk_in"),
      },
      {
        field: "label",
        headerName: t("web.money_received.paid_for"),
        flex: 1.2,
        minWidth: 180,
        valueGetter: (_value, row) => row.label ?? "",
      },
      {
        field: "source",
        headerName: t("wallet.filter_by_type"),
        width: 160,
        renderCell: (params) => (
          <StatusChip
            tone={KIND_TONE[params.row.source]}
            icon={KIND_ICON[params.row.source]}
            label={t(WALLET_SOURCE_LABEL_KEY[params.row.source])}
          />
        ),
      },
      {
        field: "collectorUserId",
        headerName: t("ledger.collected_by"),
        width: 160,
        valueGetter: (_value, row) => userName(row.collectorUserId) ?? t("common.unknown"),
      },
      {
        field: "amount",
        headerName: t("ledger.amount"),
        width: 170,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const money = formatMoneyPair(params.row.amount, snapshotCurrency(params.row, currencies), display);
          return <MoneyText primary={money.primary} approx={money.approx} />;
        },
      },
    ],
    [currencies, display, t, userName],
  );

  const totals = detail && detail.byCurrency.length > 1
    ? detail.byCurrency
        .map((part) => {
          const currency = findCurrency(currencies, part.currencyId);
          return formatMoney(part.amount, currency, currency);
        })
        .join(" · ")
    : null;

  return (
    <>
      <DataTable<WalletItem>
        label={t("wallet.transactions_section")}
        columns={columns}
        rows={paging.rows}
        total={paging.total}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.onPageChange}
        loaded={detail !== null}
        loading={loading}
        filters={
          <>
            <FilterSelect<string | null>
              label={t("wallet.filter_by_customer")}
              anyLabel={t("wallet.all_customers")}
              value={filters.filter.customerId}
              onChange={(customerId) => filterBy({ customerId })}
              options={filters.customers}
              searchable
            />
            <FilterSelect<WalletSource | null>
              label={t("wallet.filter_by_type")}
              anyLabel={t("wallet.all_types")}
              value={filters.filter.source}
              onChange={(source) => filterBy({ source })}
              options={WALLET_SOURCES.map((source) => ({
                value: source,
                label: t(WALLET_SOURCE_LABEL_KEY[source]),
              }))}
              minWidth={150}
            />
            <Box sx={{ width: 170 }}>
              <DateField
                label={t("wallet.date_from")}
                value={filters.filter.fromDay ?? ""}
                onChange={(value) => filterBy({ fromDay: value || null })}
                maxDate={filters.filter.toDay ?? undefined}
                size="small"
                clearable
              />
            </Box>
            <Box sx={{ width: 170 }}>
              <DateField
                label={t("wallet.date_to")}
                value={filters.filter.toDay ?? ""}
                onChange={(value) => filterBy({ toDay: value || null })}
                minDate={filters.filter.fromDay ?? undefined}
                size="small"
                clearable
              />
            </Box>
            {filters.active ? <Button onClick={clearFilters}>{t("common.clear_filters")}</Button> : null}
          </>
        }
        toolbarActions={
          mode !== "view" && items.length > 0 ? (
            <Button
              variant="contained"
              startIcon={<DoneAllOutlined />}
              disabled={busy}
              onClick={() => void actAll()}
            >
              {t(walletActLabelKey(mode, true))}
            </Button>
          ) : null
        }
        summary={
          <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t("wallet.total_held")}
              </Typography>
              {totals ? (
                <Typography variant="caption" color="text.secondary">
                  {totals}
                </Typography>
              ) : null}
            </Box>
            <Typography sx={{ fontWeight: 700 }}>
              {formatMoney(detail?.totalUsd ?? 0, null, display)}
            </Typography>
          </Stack>
        }
        rowLabel={rowLabel}
        rowActions={rowActions}
        bulkActions={bulkActions}
        empty={{ title: t("wallet.empty_title"), hint: t("wallet.empty_desc") }}
        filtered={filters.active}
        onClearFilters={clearFilters}
        error={error}
        onDismissError={onDismissError}
        onReload={onReload}
      />
      {openedId ? <PaymentDetailDialog collectionId={openedId} onClose={() => setOpenedId(null)} /> : null}
    </>
  );
}
