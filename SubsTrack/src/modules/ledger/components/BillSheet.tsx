import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import type { Charge, Collection } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDate } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { BillPaymentsList } from "./BillPaymentsList";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  charge: Charge | null;
  label: string;
  /** Who the receipt goes to. Omit to hide the WhatsApp action. */
  recipient?: { name: string; phone: string | null } | null;
  /** Collect what is still owed on this bill. Hidden once it is settled. */
  onCollect?: (charge: Charge) => void;
  /**
   * Void the bill AND every payment on it. Omit to hide the action — the owner
   * of the record supplies it (a month's panel does; a sale is voided from the
   * sale itself). Resolves true once it is gone, so the sheet can close.
   */
  onVoidBill?: (charge: Charge) => Promise<boolean>;
  /**
   * A hand-over on this bill was voided. The row comes with the split it had
   * settled, so the caller patches its own view instead of re-reading.
   */
  onChanged?: (voided: Collection) => void;
}

/**
 * One bill, and every payment that has reached it.
 *
 * This is the shape change the whole rewrite is for: a bill used to be a single
 * row with one amount and one date, so a second payment had nowhere to go. Now
 * the hero shows a running `15 / 20 $` and `BillPaymentsList` lists each
 * hand-over with its own date and collector.
 *
 * Two different corrections live here, and they are not the same statement:
 * voiding ONE PAYMENT says that hand-over was wrong and leaves the bill owed
 * (the list owns that), while `onVoidBill` says the BILL should never have
 * existed and takes every payment on it down too — that is the footer.
 */
export function BillSheet({
  visible,
  onDismiss,
  charge,
  label,
  recipient,
  onCollect,
  onVoidBill,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  // Reported by the payments list after every load, so the hero and the rows
  // can never disagree about how much money reached this bill.
  const [collected, setCollected] = useState(0);
  const [voiding, setVoiding] = useState(false);

  const handleCollected = useCallback((v: number) => setCollected(v), []);

  // A different bill has a different total — drop the old one rather than let
  // the hero show last month's figure for the frame before the list loads.
  const chargeId = charge?.id ?? null;
  useEffect(() => setCollected(0), [chargeId]);

  if (!charge) return null;

  const source = snapshotCurrency(charge, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const balance = charge.amount - collected;
  const settled = balance <= 0;
  const partial = collected > 0 && balance > 0;

  // The caller owns the confirm (it knows what the record is called) and the
  // refresh; the sheet closes once the bill it is showing no longer exists.
  async function handleVoidBill() {
    if (!onVoidBill || !charge || voiding) return;
    setVoiding(true);
    try {
      if (await onVoidBill(charge)) onDismiss();
    } finally {
      setVoiding(false);
    }
  }

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title={label}>
      <View className="gap-5 px-4 pb-8">
        {/* Collected out of owed — the running total, not a one-off snapshot. */}
        <View className="items-center gap-1 py-2">
          <Text className="text-3xl font-bold text-slate-900">
            {settled
              ? money(charge.amount)
              : formatPaidFraction(collected, charge.amount, source, display)}
          </Text>
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
                settled ? "text-emerald-700" : partial ? "text-amber-700" : "text-red-700"
              }`}
            >
              {settled ? t("ledger.settled") : partial ? t("ledger.partial") : t("ledger.open")}
            </Text>
          </View>
        </View>

        <View className="gap-2 rounded-xl bg-slate-50 px-4 py-3">
          <Row label={t("ledger.due_date")} value={formatDate(charge.dueDate, locale)} />
          <Row label={t("ledger.issued_at")} value={formatDate(charge.issuedAt, locale)} />
          {charge.notes ? <Row label={t("ledger.notes")} value={charge.notes} /> : null}
        </View>

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

        {/* The bill itself was a mistake — it goes, and the cash on it with it.
            Last, because the per-payment void above is the usual correction and
            this one is the wider statement. */}
        {onVoidBill && (
          <Button
            label={t("ledger.void_month")}
            variant="danger"
            loading={voiding}
            onPress={() => void handleVoidBill()}
          />
        )}
      </View>
    </FormSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-slate-600">{label}</Text>
      <Text className="text-sm text-slate-900">{value}</Text>
    </View>
  );
}
