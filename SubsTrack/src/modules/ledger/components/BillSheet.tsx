import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { COLORS } from "@/src/shared/constants";
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
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { collectionService } from "../services/CollectionService";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  charge: Charge | null;
  label: string;
  /** Collect what is still owed on this bill. Hidden once it is settled. */
  onCollect?: (charge: Charge) => void;
  /** Void ONE hand-over. It may cover other bills too — the caller warns. */
  onVoidPayment?: (collection: Collection) => void;
  onSendInvoice?: (charge: Charge) => void;
}

/**
 * One bill, and every payment that has reached it.
 *
 * This is the shape change the whole rewrite is for: a bill used to be a single
 * row with one amount and one date, so a second payment had nowhere to go. Now
 * the hero shows a running `15 / 20 $` and the body lists each hand-over with
 * its own date and collector.
 */
export function BillSheet({
  visible,
  onDismiss,
  charge,
  label,
  onCollect,
  onVoidPayment,
  onSendInvoice,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const [payments, setPayments] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !charge) return;
    let cancelled = false;
    setLoading(true);
    collectionService
      .getPaymentsForCharge(charge.id)
      .then((rows) => {
        if (!cancelled) setPayments(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, charge]);

  if (!charge) return null;

  const source = snapshotCurrency(charge, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const collected = payments.reduce((sum, p) => sum + itemAmount(p, charge.id), 0);
  const balance = charge.amount - collected;
  const settled = balance <= 0;
  const partial = collected > 0 && balance > 0;

  const userName = (id: string | null) =>
    users.find((u) => u.id === id)?.fullName ?? t("common.unknown");

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title={label}>
      <View className="gap-5 px-4 pb-8">
        {/* Collected out of owed — the running total, not a one-off snapshot. */}
        <View className="items-center gap-1 py-2">
          <Text className="text-3xl font-bold text-slate-900">
            {settled ? money(charge.amount) : formatPaidFraction(collected, charge.amount, source, display)}
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

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("ledger.payments_count", { count: payments.length })}
          </Text>
          {loading ? (
            <ActivityIndicator />
          ) : payments.length === 0 ? (
            <Text className="py-2 text-sm text-slate-500">{t("ledger.no_payments_yet")}</Text>
          ) : (
            payments.map((p) => {
              const paidHere = itemAmount(p, charge.id);
              const coversMore = (p.items?.length ?? 0) > 1;
              return (
                <View
                  key={p.id}
                  className="flex-row items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <Ionicons name="cash-outline" size={18} color={COLORS.success} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">{money(paidHere)}</Text>
                    <Text className="text-xs text-slate-500">
                      {formatDate(p.receivedAt, locale)} · {userName(p.receivedByUserId)}
                      {coversMore ? ` · ${t("ledger.covers_others")}` : ""}
                    </Text>
                  </View>
                  {onVoidPayment && !p.voidedAt && (
                    <>
                      <PressableOpacity onPress={() => setMenuFor(p.id)} className="p-1">
                        <Ionicons name="ellipsis-vertical" size={16} color={COLORS.gray500} />
                      </PressableOpacity>
                      <ActionMenu
                        visible={menuFor === p.id}
                        onDismiss={() => setMenuFor(null)}
                        actions={
                          [
                            {
                              key: "void",
                              label: t("ledger.void_payment"),
                              icon: "trash-outline",
                              destructive: true,
                              onPress: () => {
                                setMenuFor(null);
                                onVoidPayment(p);
                              },
                            },
                          ] satisfies ActionMenuItem[]
                        }
                      />
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View className="gap-2">
          {!settled && onCollect && (
            <Button
              label={t("ledger.collect_remaining", { amount: money(balance) })}
              onPress={() => onCollect(charge)}
            />
          )}
          {onSendInvoice && (
            <Button
              label={t("invoicing.send_on_whatsapp")}
              variant="ghost"
              onPress={() => onSendInvoice(charge)}
            />
          )}
        </View>
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

/** What one hand-over put against THIS bill — it may have covered others too. */
function itemAmount(collection: Collection, chargeId: string): number {
  return (collection.items ?? [])
    .filter((i) => i.chargeId === chargeId)
    .reduce((sum, i) => sum + i.amount, 0);
}
