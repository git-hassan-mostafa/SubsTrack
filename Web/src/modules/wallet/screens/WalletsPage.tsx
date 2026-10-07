import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { UserWallet } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { useOwedChanged } from "@shared/modules/ledger/hooks/useOwedChanged";
import { useWalletActions } from "@shared/modules/wallet/hooks/useWalletActions";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { cashOnHandUsd, walletMenuItems } from "@shared/modules/wallet/utils/walletView";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { MoneyText } from "@/shared/components/MoneyText";
import { DataTable } from "@/shared/table/DataTable";
import { RowLink } from "@/shared/table/RowLink";
import { toTableActions, type TableAction } from "@/shared/table/tableAction";
import { useRowsPage } from "@/shared/table/useRowsPage";
import { WalletHolderChips } from "../components/WalletHolderChips";
import { WALLET_ACTION_ICONS } from "../utils/walletLook";

type WalletRow = UserWallet & { id: string };

const rowLabel = (row: WalletRow) => row.holderName;

const rowTone = (row: WalletRow) => (row.active ? null : "muted");

const walletPath =(holderUserId: string) => `/admin/wallets/${holderUserId}`;

// Everyone holding cash not yet out; re-read only after a money write or branch switch.
export function WalletsPage() {
  const { t } = useTranslation();
  const branch = useEffectiveBranchFilter();
  const wallets = useWalletStore((s) => s.items);
  const loaded = useWalletStore((s) => s.loaded);
  const loading = useWalletStore((s) => s.loading);
  const error = useWalletStore((s) => s.error);
  const fetchWallets = useWalletStore((s) => s.fetchWallets);
  const ensureWallets = useWalletStore((s) => s.ensureWallets);
  const clearError = useWalletStore((s) => s.clearError);
  const { busyHolderId, actOnAll } = useWalletActions();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();

  const ensure = useCallback(() => void ensureWallets(), [ensureWallets]);
  useEffect(() => {
    ensure();
  }, [branch, ensure]);
  useOwedChanged(ensure);

  const rows = useMemo<WalletRow[]>(
    () => wallets.map((wallet) => ({ ...wallet, id: wallet.holderUserId })),
    [wallets],
  );
  const paging = useRowsPage(rows);

  const rowActions = useCallback(
    (row: WalletRow): TableAction[] =>
      toTableActions(walletMenuItems(row), t, {
        icons: WALLET_ACTION_ICONS,
        run: { act_all: () => void actOnAll(row), blocked: () => {} },
      }),
    [actOnAll, t],
  );

  const rowBusy = useCallback((row: WalletRow) => busyHolderId === row.holderUserId, [busyHolderId]);

  const columns = useMemo<GridColDef<WalletRow>[]>(
    () => [
      {
        field: "holderName",
        headerName: t("web.wallet.holder"),
        flex: 1,
        minWidth: 220,
        renderCell: (params) => (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", height: "100%" }}>
            <RowLink
              label={params.row.holderName}
              tabIndex={params.tabIndex}
              href={walletPath(params.row.holderUserId)}
            />
            <WalletHolderChips wallet={params.row} />
          </Stack>
        ),
      },
      {
        field: "itemCount",
        headerName: t("wallet.transactions_section"),
        width: 140,
      },
      {
        field: "byCurrency",
        headerName: t("web.wallet.by_currency"),
        flex: 1,
        minWidth: 220,
        valueGetter: (_value, row) =>
          row.byCurrency
            .map((part) => {
              const currency = findCurrency(currencies, part.currencyId);
              return formatMoney(part.amount, currency, currency);
            })
            .join(" · "),
      },
      {
        field: "totalUsd",
        headerName: t("wallet.total_held"),
        width: 180,
        renderCell: (params) => (
          <MoneyText primary={formatMoney(params.row.totalUsd, null, display)} />
        ),
      },
    ],
    [currencies, display, t],
  );

  return (
    <DataTable<WalletRow>
      viewKey="wallets"
      label={t("wallet.title")}
      columns={columns}
      rows={paging.rows}
      total={paging.total}
      page={paging.page}
      pageSize={paging.pageSize}
      onPageChange={paging.onPageChange}
      loaded={loaded}
      loading={loading}
      summary={
        <Stack direction="row" spacing={2} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
          <Typography variant="body2" color="text.secondary">
            {t("wallet.cash_on_hand")}
          </Typography>
          <Typography sx={{ fontWeight: 700 }}>
            {formatMoney(cashOnHandUsd(wallets), null, display)}
          </Typography>
        </Stack>
      }
      rowLabel={rowLabel}
      rowActions={rowActions}
      rowBusy={rowBusy}
      rowTone={rowTone}
      empty={{ title: t("wallet.list_empty_title"), hint: t("wallet.list_empty_desc") }}
      filtered={false}
      error={error}
      onDismissError={clearError}
      onReload={() => void fetchWallets()}
    />
  );
}
