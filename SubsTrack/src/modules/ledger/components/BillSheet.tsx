import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { toActionMenuItems, type Glyph } from "@/src/shared/lib/menuActions";
import { Button } from "@/src/shared/components/Button";
import { InfoRows } from "@/src/shared/components/InfoRows";
import type { Charge, Collection } from "@shared/core/types";
import {
  formatMoney,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import {
  sendBlockedKey,
  type ContactRecipient,
} from "@shared/modules/invoicing/utils/invoiceRecipient";
import { COLORS } from "@/src/shared/constants";
import { billLook } from "@shared/modules/ledger/utils/billState";
import {
  billFacts,
  billHeadline,
  billInfoRows,
  billMenuItems,
  type BillActionKey,
} from "@shared/modules/ledger/utils/billView";
import { BillHero } from "./BillHero";
import { BillPaymentsList } from "./BillPaymentsList";
import { BillHistorySheet } from "./BillHistorySheet";

const BILL_ACTION_ICONS: Record<BillActionKey, Glyph> = {
  history: "time-outline",
  revert_write_off: "arrow-undo-outline",
  write_off: "remove-circle-outline",
  void: "close-circle-outline",
};

interface Props {
  visible: boolean;
  onDismiss: () => void;
  charge: Charge | null;
  label: string;
  customerName?: string | null;
  recipient?: ContactRecipient | null;
  onCollect?: (charge: Charge) => void;
  onVoidBill?: (charge: Charge) => Promise<boolean>;
  onWriteOff?: (charge: Charge, balance: number) => void;
  onRevertWriteOff?: (charge: Charge, balance: number) => Promise<void>;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
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
  const display = useDisplayCurrency();
  const money = (v: number) => formatMoney(v, source, source);

  const facts = billFacts(charge, collected);
  const { voided, balance } = facts;
  const state = billLook(facts.status);
  const headline = billHeadline(charge, facts, collected, source, t);
  const approx = formatMoneyPair(charge.amount, source, display).approx;

  async function handleVoidBill() {
    if (!onVoidBill || !charge) return;
    if (await onVoidBill(charge)) onDismiss();
  }

  async function handleRevertWriteOff() {
    if (!onRevertWriteOff || !charge) return;
    await onRevertWriteOff(charge, balance);
    onDismiss();
  }

  const doors = {
    revertWriteOff: !!onRevertWriteOff,
    writeOff: !!onWriteOff,
    void: !!onVoidBill,
  };
  const menuActions = toActionMenuItems(
    billMenuItems(facts, { isAdmin }, doors),
    t,
    {
      icons: BILL_ACTION_ICONS,
      run: {
        history: () => setHistoryOpen(true),
        revert_write_off: () => void handleRevertWriteOff(),
        write_off: () => onWriteOff?.(charge, balance),
        void: () => void handleVoidBill(),
      },
    },
  );

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
              amount={headline.amount}
              approx={approx}
              note={headline.note}
            />

            <InfoRows
              rows={billInfoRows(charge, source, t, userName)}
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

          {facts.canCollect && onCollect && (
            <Button
              label={t("ledger.collect_remaining", { amount: money(balance) })}
              onPress={() => onCollect(charge)}
            />
          )}

          {!voided && recipient ? (
            <SendOnWhatsAppButton
              blockedKey={sendBlockedKey(recipient)}
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
