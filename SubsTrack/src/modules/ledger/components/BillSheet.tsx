import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import type { ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { Button } from "@/src/shared/components/Button";
import { InfoRows } from "@/src/shared/components/InfoRows";
import type { Charge, Collection } from "@shared/core/types";
import {
  findCurrency,
  formatMoney,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { SendOnWhatsAppButton, useSendInvoice } from "@/src/modules/invoicing";
import { COLORS } from "@/src/shared/constants";
import { billLook } from "@shared/modules/ledger/utils/billState";
import {
  billFacts,
  billHeadline,
  billInfoRows,
} from "@shared/modules/ledger/utils/billView";
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
  if (onRevertWriteOff && facts.canRevertWriteOff) {
    menuActions.push({
      key: "revert_write_off",
      group: "manage",
      label: t("ledger.revert_write_off"),
      icon: "arrow-undo-outline",
      caption: t("ledger.revert_write_off_caption"),
      onPress: () => void handleRevertWriteOff(),
    });
  }
  if (onWriteOff && facts.canWriteOff) {
    menuActions.push({
      key: "write_off",
      group: "danger",
      label: t("ledger.write_off"),
      icon: "remove-circle-outline",
      caption: t("ledger.write_off_caption"),
      onPress: () => onWriteOff(charge, balance),
    });
  }
  if (onVoidBill && facts.canVoid) {
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
