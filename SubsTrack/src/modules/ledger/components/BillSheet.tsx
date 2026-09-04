import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
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
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { useAuth } from "@/src/modules/authentication/auth";
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
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const { isAdmin } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);

  const [collected, setCollected] = useState(0);

  const handleCollected = useCallback((v: number) => setCollected(v), []);

  const chargeId = charge?.id ?? null;
  useEffect(() => setCollected(0), [chargeId]);

  if (!charge) return null;

  const source = snapshotCurrency(charge, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, source);

  const balance = charge.amount - collected;
  const settled = balance <= 0;
  const partial = collected > 0 && balance > 0;
  const approx = formatMoneyPair(charge.amount, source, display).approx;
  const monthLabel =
    charge.kind === "month" && charge.billingMonth
      ? getBlockRangeLabel(charge.billingMonth, charge.durationMonths, t)
      : null;

  async function handleVoidBill() {
    if (!onVoidBill || !charge) return;
    if (await onVoidBill(charge)) onDismiss();
  }

  const menuActions: ActionMenuItem[] = [];
  if (isAdmin) {
    menuActions.push({
      key: "history",
      label: t("audit.history"),
      icon: "time-outline",
      onPress: () => setHistoryOpen(true),
    });
  }
  if (onVoidBill) {
    menuActions.push({
      key: "void",
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
      menuActions={menuActions}
    >
      <View className="gap-5 pb-8">
        {/* Collected out of owed — the running total, not a one-off snapshot. */}
        <View className="items-center gap-1 py-2">
          <Text className="text-3xl font-bold text-slate-900">
            {settled
              ? money(charge.amount)
              : formatPaidFraction(collected, charge.amount, source, source)}
          </Text>
          {approx ? (
            <Text className="text-xs text-slate-400">{approx}</Text>
          ) : null}
          {!settled && (
            <Text className="text-sm text-slate-600">
              {t("ledger.remaining")} {money(balance)}
            </Text>
          )}
          <View
            className={`mt-1 rounded-full px-3 py-1 ${
              settled ? "bg-emerald-50" : partial ? "bg-amber-50" : "bg-red-50"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                settled
                  ? "text-emerald-700"
                  : partial
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {settled
                ? t("ledger.settled")
                : partial
                  ? t("ledger.partial")
                  : t("ledger.open")}
            </Text>
          </View>
        </View>

        <InfoRows
          rows={[
            {
              label: t("ledger.customer_label"),
              value: customerName ?? recipient?.name,
            },
            { label: t("ledger.billing_month"), value: monthLabel },
            { label: t("ledger.bill_total"), value: money(charge.amount) },
            {
              label: t("ledger.due_date"),
              value: formatDate(charge.dueDate, locale),
            },
            {
              label: t("ledger.issued_at"),
              value: formatDateTime(charge.issuedAt, locale),
            },
            {
              label: t("ledger.recorded_by"),
              value: users.find((u) => u.id === charge.recordedByUserId)
                ?.fullName,
            },
            { label: t("ledger.notes"), value: charge.notes },
          ]}
        />

        <BillPaymentsList
          chargeId={charge.id}
          snapshot={charge}
          visible={visible}
          recipient={recipient}
          onChanged={onChanged}
          onCollectedChange={handleCollected}
        />

        {!settled && onCollect && (
          <Button
            label={t("ledger.collect_remaining", { amount: money(balance) })}
            onPress={() => onCollect(charge)}
          />
        )}

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
