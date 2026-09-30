import { useState } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { Collection, Currency } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import type { BillPayments } from "@shared/modules/ledger/hooks/useBillPayments";
import type { CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import { paidToCharge } from "@shared/modules/ledger/utils/paidToCharge";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { StatusChip } from "@/shared/components/StatusChip";
import { RowActionsMenu } from "@/shared/table/RowActionsMenu";
import { RowLink } from "@/shared/table/RowLink";
import { useSendCollectionReceipt } from "@/modules/invoicing/useSendCollectionReceipt";
import type { BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
import { CorrectPaymentDialog } from "../payment/CorrectPaymentDialog";
import { PaymentDetailDialog } from "../payment/PaymentDetailDialog";
import { paymentActions } from "../payment/paymentActions";
import { VoidPaymentDialog } from "../void/VoidPaymentDialog";

interface BillPaymentsListProps {
  bill: BillPayments;
  chargeId: string;
  source: Currency | null;
  billVoided: boolean;
  recipient?: BillRecipient | null;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
}

// Every payment on ONE bill; voiding a row leaves the bill owed (#109).
export function BillPaymentsList({ bill, chargeId, source, billVoided, recipient, onChanged }: BillPaymentsListProps) {
  const { t } = useTranslation();
  const userName = useUserNames();
  const sendReceipt = useSendCollectionReceipt();
  const [voidTarget, setVoidTarget] = useState<Collection | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const money = (value: number) => formatMoney(value, source, source);
  const rows = bill.payments;
  const sendable = !!recipient && whatsAppChatUrl(recipient.phone) !== null;

  const corrected = (correction: CollectionCorrection) => {
    setCorrectId(null);
    bill.markCorrected(correction);
    onChanged?.(correction.voided, correction.replacement);
  };

  const actionsFor = (payment: Collection) =>
    paymentActions(t, {
      onDetails: () => setDetailId(payment.id),
      onSend: sendable && recipient ? () => void sendReceipt({ name: recipient.name, phoneNumber: recipient.phone }, payment) : undefined,
      onCorrect: () => setCorrectId(payment.id),
      onVoid: () => setVoidTarget(payment),
    });

  return (
    <Stack spacing={1}>
      <Typography sx={{ fontWeight: 700 }}>
        {t("ledger.payments_count", { count: billVoided ? rows.length : bill.live.length })}
      </Typography>
      {billVoided && rows.length > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("ledger.bill_voided_payments_hint")}
        </Typography>
      ) : null}
      <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("ledger.no_payments_yet")}
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label={t("web.bill.payments_table")}>
            <TableHead>
              <TableRow>
                <TableCell>{t("ledger.received_at")}</TableCell>
                <TableCell>{t("ledger.collected_by")}</TableCell>
                <TableCell>{t("ledger.notes")}</TableCell>
                <TableCell align="right">{t("web.bill.paid_here")}</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((payment) => {
                const voided = billVoided || payment.voidedAt !== null;
                const coversMore = (payment.items?.length ?? 0) > 1;
                const date = formatDateTime(payment.receivedAt);
                return (
                  <TableRow key={payment.id} sx={{ opacity: voided ? 0.6 : 1 }}>
                    <TableCell>
                      <RowLink label={date} tabIndex={0} onClick={() => setDetailId(payment.id)} />
                    </TableCell>
                    <TableCell>{userName(payment.receivedByUserId) ?? t("common.unknown")}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="body2" noWrap title={payment.notes ?? undefined}>
                        {payment.notes ?? ""}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, textDecoration: voided ? "line-through" : "none" }}
                      >
                        {money(paidToCharge(payment, chargeId))}
                      </Typography>
                      {coversMore ? (
                        <Typography variant="caption" color="text.secondary">
                          {t("ledger.covers_others")}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {voided ? (
                        <StatusChip tone="gray" label={t("ledger.voided")} />
                      ) : (
                        <RowActionsMenu rowLabel={date} actions={actionsFor(payment)} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {voidTarget ? (
        <VoidPaymentDialog
          collection={voidTarget}
          onBillChargeId={chargeId}
          onDone={(voided) => {
            setVoidTarget(null);
            bill.markVoided(voided);
            onChanged?.(voided);
          }}
          onClose={() => setVoidTarget(null)}
        />
      ) : null}
      {correctId ? (
        <CorrectPaymentDialog collectionId={correctId} onDone={corrected} onClose={() => setCorrectId(null)} />
      ) : null}
      {detailId ? <PaymentDetailDialog collectionId={detailId} onClose={() => setDetailId(null)} /> : null}
    </Stack>
  );
}
