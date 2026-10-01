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
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import CloseIcon from "@mui/icons-material/Close";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import RemoveCircleOutlineOutlined from "@mui/icons-material/RemoveCircleOutlineOutlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import WhatsApp from "@mui/icons-material/WhatsApp";
import type { Charge, Collection } from "@shared/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBillPayments } from "@shared/modules/ledger/hooks/useBillPayments";
import { billFacts, billInfoRows } from "@shared/modules/ledger/utils/billView";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { InfoRows } from "@/shared/components/InfoRows";
import type { TableAction } from "@/shared/table/tableAction";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { BillHistoryDialog } from "@/modules/admin/audit/RecordHistoryDialog";
import { useSendBillReceipt, type BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
import { BillPaymentsList } from "./BillPaymentsList";
import { DialogHeading } from "@/shared/components/DialogHeading";
import { KIND_ICON, KIND_TONE } from "../kindLook";
import { withInfoIcons } from "../infoIcons";
import { BillSummary } from "./BillSummary";

interface BillDialogProps {
  charge: Charge;
  label: string;
  customerName?: string | null;
  recipient?: BillRecipient | null;
  onClose: () => void;
  onCollect?: (charge: Charge, balance: number) => void;
  onVoidBill?: (charge: Charge) => boolean | Promise<boolean>;
  onWriteOff?: (charge: Charge, balance: number) => void;
  onRevertWriteOff?: (charge: Charge, balance: number) => Promise<void>;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
}

// One bill (month or custom fee) with every payment on it; each door is opt-in.
export function BillDialog({
  charge,
  label,
  customerName,
  recipient,
  onClose,
  onCollect,
  onVoidBill,
  onWriteOff,
  onRevertWriteOff,
  onChanged,
}: BillDialogProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());
  const userName = useUserNames();
  const sendBill = useSendBillReceipt();
  const bill = useBillPayments(charge.id, true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleId = useId();

  const source = snapshotCurrency(charge, currencies);
  const facts = billFacts(charge, bill.collected);
  const sendable = !!recipient && whatsAppChatUrl(recipient.phone) !== null;
  const subject = customerName ?? recipient?.name ?? null;

  const voidBill = async () => {
    if (onVoidBill && (await onVoidBill(charge))) onClose();
  };

  const revertWriteOff = async () => {
    if (!onRevertWriteOff) return;
    await onRevertWriteOff(charge, facts.balance);
    onClose();
  };

  const actions: TableAction[] = [];
  if (isAdmin) {
    actions.push({
      key: "history",
      group: "history",
      label: t("audit.history"),
      icon: HistoryOutlined,
      onClick: () => setHistoryOpen(true),
    });
  }
  if (onRevertWriteOff && facts.canRevertWriteOff) {
    actions.push({
      key: "revert_write_off",
      group: "manage",
      label: t("ledger.revert_write_off"),
      caption: t("ledger.revert_write_off_caption"),
      icon: UndoOutlined,
      onClick: () => void revertWriteOff(),
    });
  }
  if (onWriteOff && facts.canWriteOff) {
    actions.push({
      key: "write_off",
      group: "danger",
      label: t("ledger.write_off"),
      caption: t("ledger.write_off_caption"),
      icon: RemoveCircleOutlineOutlined,
      onClick: () => onWriteOff(charge, facts.balance),
    });
  }
  if (onVoidBill && facts.canVoid) {
    actions.push({
      key: "void",
      group: "danger",
      label: t("ledger.void_month"),
      icon: CancelOutlined,
      destructive: true,
      onClick: () => void voidBill(),
    });
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <DialogTitle component="div" sx={{ paddingInlineEnd: 14 }}>
        <DialogHeading
          id={titleId}
          icon={KIND_ICON[charge.kind]}
          tone={KIND_TONE[charge.kind]}
          kind={t(`web.bill.kind_${charge.kind}`)}
          title={label}
          subtitle={subject ? t("web.bill.for_customer", { name: subject }) : null}
        />
      </DialogTitle>
      <Stack direction="row" spacing={0.5} sx={{ position: "absolute", insetInlineEnd: 12, top: 12 }}>
        <RowActionsMenu rowLabel={label} actions={actions} />
        <IconButton aria-label={t("common.close")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent dividers>
        {bill.loading ? (
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
                total={charge.amount}
                collected={bill.collected}
                balance={facts.balance}
                source={source}
                display={display}
              />
              <InfoRows rows={withInfoIcons(billInfoRows(charge, source, t, userName))} />
            </Box>
            <BillPaymentsList
              bill={bill}
              chargeId={charge.id}
              source={source}
              billVoided={facts.voided}
              recipient={recipient}
              onChanged={onChanged}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t("common.close")}</Button>
        {!facts.voided && recipient ? (
          <Tooltip title={sendable ? "" : t("invoice.no_phone")}>
            <span>
              <Button
                variant="outlined"
                startIcon={<WhatsApp />}
                disabled={!sendable || bill.loading}
                onClick={() => void sendBill(recipient, charge, bill.payments)}
              >
                {t("invoice.send_bill_whatsapp")}
              </Button>
            </span>
          </Tooltip>
        ) : null}
        {facts.canCollect && onCollect && !bill.loading ? (
          <Button variant="contained" onClick={() => onCollect(charge, facts.balance)}>
            {t("ledger.collect_remaining", { amount: formatMoney(facts.balance, source, source) })}
          </Button>
        ) : null}
      </DialogActions>
      {historyOpen ? (
        <BillHistoryDialog chargeId={charge.id} name={label} onClose={() => setHistoryOpen(false)} />
      ) : null}
    </Dialog>
  );
}
