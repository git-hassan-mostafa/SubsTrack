import { useId } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import type { CollectionItem, CollectionListItem } from "@shared/core/types";
import { findCurrency, formatMoney, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate } from "@shared/core/utils/date";
import { useCollectionDetail } from "@shared/modules/ledger/hooks/useCollectionDetail";
import { collectionInfoRows } from "@shared/modules/ledger/utils/collectionView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { InfoRows } from "@/shared/components/InfoRows";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";

export type OpenPaidBill = (item: CollectionItem, label: string, customerName: string | null) => void;

interface PaymentDetailDialogProps {
  collectionId: string;
  initial?: CollectionListItem | null;
  onClose: () => void;
  onOpenItem?: OpenPaidBill;
  loadingItemId?: string | null;
}

// One hand-over in full: who took it, who holds it, and which bills it paid.
export function PaymentDetailDialog({
  collectionId,
  initial = null,
  onClose,
  onOpenItem,
  loadingItemId = null,
}: PaymentDetailDialogProps) {
  const { t } = useTranslation();
  const { collection, error } = useCollectionDetail(collectionId, initial);
  const titleId = useId();

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t("ledger.payment_details")}
        {collection ? (
          <Typography variant="body2" color="text.secondary" component="span" sx={{ display: "block" }}>
            {collection.customerName ?? t("ledger.walk_in")}
          </Typography>
        ) : null}
      </DialogTitle>
      <DialogContent dividers>
        <ErrorBanner message={error} />
        {collection ? (
          <PaymentBody collection={collection} onOpenItem={onOpenItem} loadingItemId={loadingItemId} />
        ) : error ? null : (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
            <CircularProgress aria-label={t("web.loading")} />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

interface PaymentBodyProps {
  collection: CollectionListItem;
  onOpenItem?: OpenPaidBill;
  loadingItemId: string | null;
}

interface PaymentBodyProps {
  collection: CollectionListItem;
  onOpenItem?: OpenPaidBill;
  loadingItemId: string | null;
}

type PaidRow = CollectionItem & { label: string };

// Laid out like the bill dialog: the figure beside its facts, the bills below.
function PaymentBody({ collection, onOpenItem, loadingItemId }: PaymentBodyProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const source = snapshotCurrency(collection, currencies);
  const total = formatMoneyPair(collection.amount, source, display);
  const money = (value: number) => formatMoney(value, source, source);
  const voided = collection.voidedAt !== null;
  const rows: PaidRow[] = collection.items.map((item, index) => ({
    ...item,
    label: collection.itemLabels[index] || t("ledger.payment"),
  }));

  const columns: GridColDef<PaidRow>[] = [
    {
      field: "label",
      headerName: t("web.collect.bill_column"),
      flex: 1,
      minWidth: 200,
      renderCell: (params) => {
        if (!onOpenItem) return params.row.label;
        if (loadingItemId === params.row.id) {
          return <CircularProgress size={18} aria-label={t("web.loading")} />;
        }
        return (
          <RowLink
            label={params.row.label}
            tabIndex={loadingItemId === null ? params.tabIndex : -1}
            onClick={() => {
              if (loadingItemId === null) onOpenItem(params.row, params.row.label, collection.customerName);
            }}
          />
        );
      },
    },
    {
      field: "billTotal",
      headerName: t("ledger.bill_total"),
      width: 140,
      align: "right",
      headerAlign: "right",
      valueGetter: (_value, row) => (row.charge ? money(row.charge.amount) : ""),
    },
    {
      field: "dueDate",
      headerName: t("ledger.due_date"),
      width: 130,
      valueGetter: (_value, row) => (row.charge ? formatDate(row.charge.dueDate) : ""),
    },
    {
      field: "amount",
      headerName: t("web.bill.paid_here"),
      width: 160,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => (
        <Box component="span" sx={{ fontWeight: 700, textDecoration: voided ? "line-through" : "none" }}>
          {money(params.row.amount)}
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1.4fr)" },
          gap: 3,
          alignItems: "center",
        }}
      >
        <Stack spacing={0.5} sx={{ alignItems: "center", py: 1 }}>
          <Typography
            variant="h4"
            component="p"
            sx={{
              fontWeight: 700,
              color: voided ? "text.disabled" : "text.primary",
              textDecoration: voided ? "line-through" : "none",
            }}
          >
            {total.primary}
          </Typography>
          {total.approx ? (
            <Typography variant="body2" color="text.secondary">
              {total.approx}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1}>
            <StatusChip tone="gray" label={t(`ledger.kind_${collection.kind}`)} />
            {voided ? <StatusChip tone="red" label={t("ledger.voided")} /> : null}
          </Stack>
        </Stack>
        <InfoRows rows={collectionInfoRows(collection, t, userName)} />
      </Box>

      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>
          {voided ? t("ledger.this_paid") : t("ledger.this_pays")}
        </Typography>
        {voided ? (
          <Typography variant="body2" color="text.secondary">
            {t("ledger.voided_hint")}
          </Typography>
        ) : null}
        <LocalTable<PaidRow>
          label={voided ? t("ledger.this_paid") : t("ledger.this_pays")}
          columns={columns}
          rows={rows}
          rowTone={() => (voided ? "muted" : null)}
        />
      </Stack>
    </Stack>
  );
}
