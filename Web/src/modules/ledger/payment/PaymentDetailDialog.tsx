import { useId } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby={titleId}>
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

function PaymentBody({ collection, onOpenItem, loadingItemId }: PaymentBodyProps) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const source = snapshotCurrency(collection, currencies);
  const total = formatMoneyPair(collection.amount, source, display);
  const money = (value: number) => formatMoney(value, source, source);
  const voided = collection.voidedAt !== null;

  return (
    <Stack spacing={2.5}>
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

      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }}>
          {voided ? t("ledger.this_paid") : t("ledger.this_pays")}
        </Typography>
        {voided ? (
          <Typography variant="body2" color="text.secondary">
            {t("ledger.voided_hint")}
          </Typography>
        ) : null}
        <Paper variant="outlined">
          <List disablePadding>
            {collection.items.map((item, index) => {
              const label = collection.itemLabels[index] || t("ledger.payment");
              const charge = item.charge;
              const text = (
                <ListItemText
                  primary={label}
                  secondary={
                    charge
                      ? `${t("ledger.bill_total")} ${money(charge.amount)} · ${t("ledger.due_on", {
                          date: formatDate(charge.dueDate),
                        })}`
                      : null
                  }
                />
              );
              const amount = (
                <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0, marginInlineStart: 2 }}>
                  {money(item.amount)}
                </Typography>
              );
              return (
                <ListItem key={item.id} divider={index < collection.items.length - 1} disablePadding>
                  {onOpenItem ? (
                    <ListItemButton
                      onClick={() => onOpenItem(item, label, collection.customerName)}
                      disabled={loadingItemId !== null}
                    >
                      {text}
                      {loadingItemId === item.id ? (
                        <CircularProgress size={18} aria-label={t("web.loading")} sx={{ marginInlineStart: 2 }} />
                      ) : (
                        amount
                      )}
                    </ListItemButton>
                  ) : (
                    <Stack direction="row" sx={{ alignItems: "center", width: "100%", px: 2, py: 1 }}>
                      {text}
                      {amount}
                    </Stack>
                  )}
                </ListItem>
              );
            })}
          </List>
        </Paper>
      </Stack>
    </Stack>
  );
}
