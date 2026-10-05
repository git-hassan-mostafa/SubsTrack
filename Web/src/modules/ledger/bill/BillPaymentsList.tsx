import { useState } from "react";
import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import TaskAltOutlined from "@mui/icons-material/TaskAltOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import type { Collection, Currency } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import { formatDateTime } from "@shared/core/utils/date";
import type { BillPayments } from "@shared/modules/ledger/hooks/useBillPayments";
import type { CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import { paidToCharge } from "@shared/modules/ledger/utils/paidToCharge";
import {
  coversOtherBills,
  isPaymentVoided,
  paymentMenuItems,
} from "@shared/modules/ledger/utils/collectionView";
import { toTableActions } from "@/shared/table/tableAction";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { ErrorBanner } from "@/shared/components/ErrorBanner";
import { StatusChip } from "@/shared/components/StatusChip";
import { LocalTable } from "@/shared/table/LocalTable";
import { RowLink } from "@/shared/table/RowLink";
import { useSendCollectionReceipt } from "@/modules/invoicing/useSendCollectionReceipt";
import type { BillRecipient } from "@/modules/invoicing/useSendBillReceipt";
import { CorrectPaymentDialog } from "../payment/CorrectPaymentDialog";
import { PaymentDetailDialog } from "../payment/PaymentDetailDialog";
import { PAYMENT_ACTION_ICONS } from "../payment/paymentActionIcons";
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
  const voidedCount = rows.length - bill.live.length;

  const corrected = (correction: CollectionCorrection) => {
    setCorrectId(null);
    bill.markCorrected(correction);
    onChanged?.(correction.voided, correction.replacement);
  };

  const actionsFor = (payment: Collection) =>
    toTableActions(paymentMenuItems(payment, { sendable, billVoided }), t, {
      icons: PAYMENT_ACTION_ICONS,
      run: {
        details: () => setDetailId(payment.id),
        invoice: recipient
          ? () => void sendReceipt({ name: recipient.name, phoneNumber: recipient.phone }, payment)
          : undefined,
        correct: () => setCorrectId(payment.id),
        void: () => setVoidTarget(payment),
      },
    });

  const isVoided = (payment: Collection) => isPaymentVoided(payment, billVoided);

  const columns: GridColDef<Collection>[] = [
    {
      field: "receivedAt",
      headerName: t("ledger.received_at"),
      width: 170,
      renderCell: (params) => (
        <RowLink
          label={formatDateTime(params.row.receivedAt)}
          tabIndex={params.tabIndex}
          onClick={() => setDetailId(params.row.id)}
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
      field: "notes",
      headerName: t("ledger.notes"),
      flex: 1,
      minWidth: 140,
    },
    {
      field: "paidHere",
      headerName: t("web.bill.paid_here"),
      width: 170,
      align: "right",
      headerAlign: "right",
      renderCell: (params) => (
        <Stack sx={{ alignItems: "flex-end" }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: isVoided(params.row) ? "text.disabled" : "success.dark",
              textDecoration: isVoided(params.row) ? "line-through" : "none",
            }}
          >
            {money(paidToCharge(params.row, chargeId))}
          </Typography>
          {coversOtherBills(params.row) ? (
            <Typography variant="caption" color="text.secondary">
              {t("ledger.covers_others")}
            </Typography>
          ) : null}
        </Stack>
      ),
    },
    {
      field: "voidedAt",
      headerName: t("web.status"),
      width: 130,
      renderCell: (params) =>
        isVoided(params.row) ? (
          <Tooltip title={params.row.voidReason ?? ""}>
            <span>
              <StatusChip tone="red" icon={BlockOutlined} label={t("ledger.voided")} />
            </span>
          </Tooltip>
        ) : (
          <StatusChip tone="emerald" icon={TaskAltOutlined} label={t("web.bill.counted")} />
        ),
    },
  ];

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
        <PaymentsOutlined fontSize="small" sx={{ color: "text.secondary" }} aria-hidden />
        <Typography sx={{ fontWeight: 700 }}>{t("web.bill.payments_title")}</Typography>
        {rows.length > 0 && !billVoided ? (
          <StatusChip tone="emerald" label={t("web.bill.counted_count", { count: bill.live.length })} />
        ) : null}
        {voidedCount > 0 && !billVoided ? (
          <StatusChip tone="gray" label={t("web.bill.voided_count", { count: voidedCount })} />
        ) : null}
      </Stack>
      {rows.length > 0 ? (
        <Typography variant="body2" color="text.secondary">
          {billVoided ? t("ledger.bill_voided_payments_hint") : t("web.bill.payments_hint")}
        </Typography>
      ) : null}
      <ErrorBanner message={bill.error} onDismiss={bill.clearError} />
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("ledger.no_payments_yet")}
        </Typography>
      ) : (
        <LocalTable<Collection>
          label={t("web.bill.payments_table")}
          columns={columns}
          rows={rows}
          rowLabel={(payment) => formatDateTime(payment.receivedAt)}
          rowActions={actionsFor}
          rowTone={(payment) => (isVoided(payment) ? "muted" : null)}
          autoRowHeight
        />
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
