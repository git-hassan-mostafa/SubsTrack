import { useId } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { CollectionItem, CollectionListItem } from "@shared/core/types";
import { formatMoney, formatMoneyPair, snapshotCurrency } from "@shared/core/utils/currency";
import { formatDate, formatDateTime } from "@shared/core/utils/date";
import { useCollectionDetail } from "@shared/modules/ledger/hooks/useCollectionDetail";
import type { InfoKey } from "@shared/modules/ledger/utils/billView";
import { collectionInfoRows } from "@shared/modules/ledger/utils/collectionView";
import { collectionItemLabel } from "@shared/modules/ledger/utils/collectionLabel";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { DialogHeading } from "@/shared/components/DialogHeading";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { InfoRows } from "@/shared/components/InfoRows";
import { chipColors } from "@/shared/components/chipTones";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { withInfoIcons } from "../infoIcons";
import { KIND_TONE } from "@shared/modules/ledger/utils/collectionKind";
import { KIND_ICON } from "../kindLook";

export type OpenPaidBill = (item: CollectionItem, label: string, customerName: string | null) => void;

const VOID_KEYS: readonly InfoKey[] = ["voided_at", "voided_by", "void_reason"];

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
  const voided = !!collection?.voidedAt;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle component="div">
        <DialogHeading
          id={titleId}
          icon={voided ? BlockOutlined : PaymentsOutlined}
          tone={voided ? "red" : "emerald"}
          kind={voided ? t("web.payment.kind_voided") : t("web.payment.kind_received")}
          title={collection ? (collection.customerName ?? t("ledger.walk_in")) : t("ledger.payment_details")}
          subtitle={
            collection ? t("web.payment.received_when", { when: formatDateTime(collection.receivedAt) }) : null
          }
        />
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

type PaidRow = CollectionItem & { label: string };

// Laid out like the bill dialog: the figure beside its facts, the bills below.
function PaymentBody({ collection, onOpenItem, loadingItemId }: PaymentBodyProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = useDisplayCurrency();
  const userName = useUserNames();
  const source = snapshotCurrency(collection, currencies);
  const total = formatMoneyPair(collection.amount, source, display);
  const money = (value: number) => formatMoney(value, source, source);
  const voided = collection.voidedAt !== null;
  const panel = chipColors(voided ? "gray" : "emerald");
  const infoRows = collectionInfoRows(collection, t, userName).filter((row) => !VOID_KEYS.includes(row.key));
  const voidedBy = userName(collection.voidedBy);
  const tableLabel = voided ? t("web.payment.had_paid_for") : t("web.payment.paid_for");
  const rows: PaidRow[] = collection.items.map((item, index) => ({
    ...item,
    label: collectionItemLabel(collection, index, t),
  }));

  const voidedText = voided
    ? [
        voidedBy
          ? t("web.payment.voided_when_by", { when: formatDateTime(collection.voidedAt ?? ""), name: voidedBy })
          : t("web.payment.voided_when", { when: formatDateTime(collection.voidedAt ?? "") }),
        collection.voidReason ? t("web.payment.voided_reason", { reason: collection.voidReason }) : null,
        t("web.payment.voided_effect"),
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  const columns: GridColDef<PaidRow>[] = [
    {
      field: "label",
      headerName: t("web.collect.bill_column"),
      flex: 1,
      minWidth: 220,
      renderCell: (params) => {
        const kind = params.row.charge?.kind;
        const Icon = kind ? KIND_ICON[kind] : ReceiptLongOutlined;
        return (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", height: "100%" }}>
            <Icon fontSize="small" sx={{ color: "text.secondary" }} aria-hidden />
            <PaidBillName
              row={params.row}
              tabIndex={params.tabIndex}
              customerName={collection.customerName}
              onOpenItem={onOpenItem}
              loadingItemId={loadingItemId}
            />
          </Stack>
        );
      },
    },
    {
      field: "billTotal",
      headerName: t("ledger.bill_total"),
      width: 130,
      valueGetter: (_value, row) => (row.charge ? money(row.charge.amount) : ""),
    },
    {
      field: "dueDate",
      headerName: t("ledger.due_date"),
      width: 120,
      valueGetter: (_value, row) => (row.charge ? formatDate(row.charge.dueDate) : ""),
    },
    {
      field: "amount",
      headerName: t("web.payment.from_this_payment"),
      width: 170,
      renderCell: (params) => (
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            color: voided ? "text.disabled" : "success.dark",
            textDecoration: voided ? "line-through" : "none",
          }}
        >
          {money(params.row.amount)}
        </Box>
      ),
    },
  ];

  return (
    <Stack spacing={2.5}>
      {voidedText ? (
        <Alert severity="error" icon={<BlockOutlined />}>
          <AlertTitle sx={{ fontWeight: 700 }}>{t("web.payment.voided_title")}</AlertTitle>
          {voidedText}
        </Alert>
      ) : null}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1.4fr)" },
          gap: 2,
          alignItems: "start",
        }}
      >
        <Stack spacing={0.5} sx={{ px: 2, py: 1.5, borderRadius: 2, bgcolor: panel.bg }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ color: panel.fg, fontWeight: 600 }}>
              {t("ledger.amount")}
            </Typography>
            <StatusChip
              tone={KIND_TONE[collection.kind]}
              icon={KIND_ICON[collection.kind]}
              label={t(`ledger.kind_${collection.kind}`)}
            />
          </Stack>
          <Typography
            variant="h4"
            component="p"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2,
              color: voided ? "text.disabled" : "success.dark",
              textDecoration: voided ? "line-through" : "none",
            }}
          >
            {total.primary}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {[total.approx, t("web.payment.paid_toward", { count: rows.length })].filter(Boolean).join(" · ")}
          </Typography>
        </Stack>
        <InfoRows rows={withInfoIcons(infoRows)} />
      </Box>

      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ReceiptLongOutlined fontSize="small" sx={{ color: "text.secondary" }} aria-hidden />
          <Typography sx={{ fontWeight: 700 }}>{tableLabel}</Typography>
        </Stack>
        {onOpenItem ? (
          <Typography variant="body2" color="text.secondary">
            {t("web.payment.open_bill_hint")}
          </Typography>
        ) : null}
        <LocalTable<PaidRow>
          label={tableLabel}
          columns={columns}
          rows={rows}
          rowTone={() => (voided ? "muted" : null)}
        />
      </Stack>
    </Stack>
  );
}

interface PaidBillNameProps {
  row: PaidRow;
  tabIndex: -1 | 0;
  customerName: string | null;
  onOpenItem?: OpenPaidBill;
  loadingItemId: string | null;
}

// The bill's name, a link to it when the caller can open bills.
function PaidBillName({ row, tabIndex, customerName, onOpenItem, loadingItemId }: PaidBillNameProps) {
  const { t } = useTranslation();
  if (!onOpenItem) return <span>{row.label}</span>;
  if (loadingItemId === row.id) return <CircularProgress size={18} aria-label={t("web.loading")} />;
  return (
    <RowLink
      label={row.label}
      tabIndex={loadingItemId === null ? tabIndex : -1}
      onClick={() => {
        if (loadingItemId === null) onOpenItem(row, row.label, customerName);
      }}
    />
  );
}
