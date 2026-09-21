import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { Button } from "@/src/shared/components/Button";
import { InfoRows } from "@/src/shared/components/InfoRows";
import type { Charge, Collection } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDate, formatDateTime } from "@/src/core/utils/date";
import { getBlockRangeLabel } from "@/src/modules/customer/customer-payments/utils/blockRangeLabel";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useUserNames } from "@/src/shared/hooks/useUserNames";
import { useAuth } from "@/src/modules/authentication/auth";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import { COLORS } from "@/src/shared/constants";
import { billLook, chargeStatusOf } from "../utils/billState";
import { BillHero } from "./BillHero";
import { BillPaymentsList } from "./BillPaymentsList";
import { BillHistorySheet } from "./BillHistorySheet";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  charge: Charge | null;
  label: string;
  customerName?: string | null;
  recipient?: { name: string; phone: string | null } | null;
  onCollect?: (charge: Charge) => void;
  onVoidBill?: (charge: Charge) => Promise<boolean>;
  onWriteOff?: (charge: Charge, balance: number) => void;
  onRevertWriteOff?: (charge: Charge, balance: number) => Promise<void>;
  onChanged?: (voided: Collection) => void;
}


export function BillSheet({
  visible,
  onDismiss,
  charge,
  label,
  customerName,
  recipient,
  onCollect,
  onVoidBill,
  onWriteOff,
  onRevertWriteOff,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const userName = useUserNames();
  const displayCurrencyId = useDisplayCurrencyId();
  const { isAdmin } = useAuth();
  const { sendBillInvoice } = useSendInvoice();
  const [historyOpen, setHistoryOpen] = useState(false);

  const [collected, setCollected] = useState(0);
  const [payments, setPayments] = useState<Collection[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const handleCollected = useCallback((v: number) => setCollected(v), []);
  const handlePayments = useCallback((v: Collection[]) => setPayments(v), []);
  const handleLoading = useCallback((v: boolean) => setPaymentsLoading(v), []);

  const chargeId = charge?.id ?? null;
  useEffect(() => {
    setCollected(0);
    setPayments([]);
    setPaymentsLoading(true);
  }, [chargeId]);

  if (!charge) return null;

  const source = snapshotCurrency(charge, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, source);

  const voided = charge.voidedAt !== null;
  const writtenOff = !voided && charge.writtenOffAt !== null;
  const balance = charge.amount - collected;
  const settled = !voided && balance <= 0;
  const status = chargeStatusOf({
    voided,
    writtenOff,
    amount: charge.amount,
    collected,
  });
  const state = billLook(status);
  const approx = formatMoneyPair(charge.amount, source, display).approx;
  const monthLabel =
    charge.kind === "month" && charge.billingMonth
      ? getBlockRangeLabel(charge.billingMonth, charge.durationMonths, t)
      : null;

  async function handleVoidBill() {
    if (!onVoidBill || !charge) return;
    if (await onVoidBill(charge)) onDismiss();
  }

  async function handleRevertWriteOff() {
    if (!onRevertWriteOff || !charge) return;
    await onRevertWriteOff(charge, charge.amount - collected);
    onDismiss();
  }

  const menuActions: ActionMenuItem[] = [];
  if (isAdmin) {
    menuActions.push({
      key: "history",
      group: "history",
      label: t("audit.history"),
      icon: "time-outline",
      onPress: () => setHistoryOpen(true),
    });
  }
  if (onRevertWriteOff && writtenOff) {
    menuActions.push({
      key: "revert_write_off",
      group: "manage",
      label: t("ledger.revert_write_off"),
      icon: "arrow-undo-outline",
      caption: t("ledger.revert_write_off_caption"),
      onPress: () => void handleRevertWriteOff(),
    });
  }
  if (onWriteOff && !voided && !writtenOff) {
    menuActions.push({
      key: "write_off",
      group: "danger",
      label: t("ledger.write_off"),
      icon: "remove-circle-outline",
      caption: t("ledger.write_off_caption"),
      onPress: () => onWriteOff(charge, balance),
    });
  }
  if (onVoidBill && !voided) {
    menuActions.push({
      key: "void",
      group: "danger",
      label: t("ledger.void_month"),
      icon: "close-circle-outline",
      destructive: true,
      onPress: () => void handleVoidBill(),
    });
  }

  return (
    <FormSheet
      visible={visible}
      onDismiss={onDismiss}
      title={label}
      subject={customerName ?? recipient?.name}
      menuActions={menuActions}
    >
      <View className="pb-8">
        {paymentsLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View className="gap-5">
            <BillHero
              state={state}
              amount={
                voided || settled
                  ? money(charge.amount)
                  : formatPaidFraction(collected, charge.amount, source, source)
              }
              approx={approx}
              note={
                writtenOff
                  ? collected > 0
                    ? t("ledger.written_off_kept", { amount: money(collected) })
                    : null
                  : voided || settled
                    ? null
                    : `${t("ledger.remaining")} ${money(balance)}`
              }
            />

            <InfoRows
              rows={[
                { label: t("ledger.billing_month"), value: monthLabel },
                { label: t("ledger.bill_total"), value: money(charge.amount) },
                {
                  label: t("ledger.due_date"),
                  value: formatDate(charge.dueDate),
                },
                {
                  label: t("ledger.issued_at"),
                  value: formatDateTime(charge.issuedAt),
                },
                {
                  label: t("ledger.recorded_by"),
                  value: userName(charge.recordedByUserId),
                },
                { label: t("ledger.notes"), value: charge.notes },
                {
                  label: t("ledger.voided_at"),
                  value: charge.voidedAt
                    ? formatDateTime(charge.voidedAt)
                    : null,
                },
                {
                  label: t("ledger.voided_by"),
                  value: userName(charge.voidedBy),
                },
                {
                  label: t("ledger.void_reason_label"),
                  value: charge.voidReason,
                },
                {
                  label: t("ledger.written_off_at"),
                  value: charge.writtenOffAt
                    ? formatDateTime(charge.writtenOffAt)
                    : null,
                },
                {
                  label: t("ledger.written_off_by"),
                  value: userName(charge.writtenOffBy),
                },
                {
                  label: t("ledger.write_off_reason_label"),
                  value: charge.writeOffReason,
                },
              ]}
            />
          </View>
        )}

        <View
          className="gap-5 pt-5"
          style={paymentsLoading ? { display: "none" } : undefined}
        >
          <BillPaymentsList
            chargeId={charge.id}
            snapshot={charge}
            visible={visible}
            billVoided={voided}
            recipient={recipient}
            onChanged={onChanged}
            onCollectedChange={handleCollected}
            onPaymentsChange={handlePayments}
            onLoadingChange={handleLoading}
          />

          {!voided && !writtenOff && !settled && onCollect && (
            <Button
              label={t("ledger.collect_remaining", { amount: money(balance) })}
              onPress={() => onCollect(charge)}
            />
          )}

          {!voided && recipient ? (
            <SendOnWhatsAppButton
              phone={recipient.phone}
              label={t("invoice.send_bill_whatsapp")}
              onPress={() =>
                void sendBillInvoice({
                  phone: recipient.phone,
                  customerName: recipient.name,
                  charge,
                  payments,
                })
              }
            />
          ) : null}
        </View>

        {historyOpen ? (
          <BillHistorySheet
            chargeId={charge.id}
            subtitle={label}
            onDismiss={() => setHistoryOpen(false)}
          />
        ) : null}
      </View>
    </FormSheet>
  );
}
