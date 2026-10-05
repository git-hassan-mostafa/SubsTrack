import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { Collection, Sale } from "@shared/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { receiptId, saleTitle } from "@shared/core/utils/receiptId";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBillPayments } from "@shared/modules/ledger/hooks/useBillPayments";
import {
  saleInfoRows,
  saleReceiptActions,
  saleReceiptFacts,
} from "@shared/modules/transaction/sales/utils/saleView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { DialogHeading } from "@/shared/components/DialogHeading";
import { InfoRows } from "@/shared/components/InfoRows";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { toTableActions } from "@/shared/table/tableAction";
import { BillHistoryDialog } from "@/modules/admin/audit/RecordHistoryDialog";
import { BillPaymentsList } from "@/modules/ledger/bill/BillPaymentsList";
import { BillSummary } from "@/modules/ledger/bill/BillSummary";
import { withInfoIcons } from "@/modules/ledger/infoIcons";
import { KIND_TONE } from "@shared/modules/ledger/utils/collectionKind";
import { KIND_ICON } from "@/modules/ledger/kindLook";
import { SALE_ACTION_ICONS } from "./saleActionIcons";
import { SaleItemsTable } from "./SaleItemsTable";

interface SaleReceiptDialogProps {
  sale: Sale;
  onClose: () => void;
  onSend: (sale: Sale) => void;
  onEdit?: (sale: Sale) => void;
  onCollect?: (sale: Sale, paid: number) => void;
  onVoid?: (sale: Sale) => void;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
}

// A sale is its bill too: the items, then every payment that reached it.
export function SaleReceiptDialog({ sale, onClose, onSend, onEdit, onCollect, onVoid, onChanged }: SaleReceiptDialogProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const bill = useBillPayments(sale.chargeId, true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleId = useId();

  const source = snapshotCurrency(sale, currencies);
  const collected = sale.chargeId ? bill.collected : sale.amountPaid;
  const facts = saleReceiptFacts(sale, collected);
  const canCollect = facts.canCollect && !!onCollect;
  const phone = sale.customer?.phoneNumber ?? null;
  const sendable = whatsAppChatUrl(phone) !== null;
  const name = sale.customer?.name ?? null;
  const recipient = sale.customer ? { name: sale.customer.name, phone } : null;
  const title = `#${receiptId(sale.id)}`;
  const loading = !!sale.chargeId && bill.loading;

  const actions = toTableActions(saleReceiptActions(sale, { isAdmin }), t, {
    icons: SALE_ACTION_ICONS,
    run: {
      edit: onEdit ? () => onEdit(sale) : undefined,
      history: () => setHistoryOpen(true),
      void: onVoid ? () => onVoid(sale) : undefined,
    },
  });

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle component="div" sx={{ paddingInlineEnd: 14 }}>
        <DialogHeading
          id={titleId}
          icon={KIND_ICON.sale}
          tone={KIND_TONE.sale}
          kind={t("sales.receipt_title")}
          title={title}
          subtitle={name ? t("web.bill.for_customer", { name }) : t("sales.walk_in")}
        />
      </DialogTitle>
      <Stack direction="row" spacing={0.5} sx={{ position: "absolute", insetInlineEnd: 12, top: 12 }}>
        <RowActionsMenu rowLabel={title} actions={actions} />
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
            <CircularProgress aria-label={t("web.loading")} />
          </Box>
        ) : (
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1.4fr)" },
                gap: 2,
                alignItems: "start",
              }}
            >
              <BillSummary
                status={facts.status}
                total={sale.totalAmount}
                figure={facts.figure}
                collected={collected}
                balance={facts.balance}
                source={source}
                display={display}
              />
              <InfoRows rows={withInfoIcons(saleInfoRows(sale, t, userName))} />
            </Box>
            <SaleItemsTable sale={sale} source={source} />
            {sale.chargeId ? (
              <BillPaymentsList
                bill={bill}
                chargeId={sale.chargeId}
                source={source}
                billVoided={facts.voided}
                recipient={recipient}
                onChanged={onChanged}
              />
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
        {facts.voided ? null : (
          <Tooltip title={sendable ? "" : t(sale.customer ? "invoice.no_phone" : "invoice.no_customer")}>
            <span>
              <Button variant="outlined" startIcon={<WhatsApp />} disabled={!sendable} onClick={() => onSend(sale)}>
                {t("invoice.send_invoice_whatsapp")}
              </Button>
            </span>
          </Tooltip>
        )}
        {canCollect && !loading ? (
          <Button variant="contained" onClick={() => onCollect?.(sale, collected)}>
            {t("ledger.collect_remaining", { amount: formatMoney(facts.balance, source, source) })}
          </Button>
        ) : null}
      </DialogActions>
      {historyOpen ? (
        <BillHistoryDialog
          chargeId={sale.chargeId}
          targets={[{ table: "sales", recordId: sale.id }]}
          name={saleTitle(sale.id, sale.itemsSummary)}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </Dialog>
  );
}
