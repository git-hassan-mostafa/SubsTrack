import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Charge, Collection } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  formatPaidFraction,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDate, formatDateTimeShort } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSendInvoice } from "@/src/modules/invoicing";
import { collectionService } from "../services/CollectionService";
import { VoidCollectionDialog } from "./VoidCollectionDialog";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  charge: Charge | null;
  label: string;
  /** Who the receipt goes to. Omit to hide the WhatsApp action. */
  recipient?: { name: string; phone: string | null } | null;
  /** Collect what is still owed on this bill. Hidden once it is settled. */
  onCollect?: (charge: Charge) => void;
  /** Something in here moved money — the caller refreshes its own view. */
  onChanged?: () => void;
}

/**
 * One bill, and every payment that has reached it.
 *
 * This is the shape change the whole rewrite is for: a bill used to be a single
 * row with one amount and one date, so a second payment had nowhere to go. Now
 * the hero shows a running `15 / 20 $` and the body lists each hand-over with
 * its own date and collector.
 *
 * Voiding lives HERE and nowhere else, because a hand-over can cover several
 * bills — "void this month" is not a thing that can be undone on its own, only
 * the payment can. The row says so when it covers more than this bill.
 */
export function BillSheet({
  visible,
  onDismiss,
  charge,
  label,
  recipient,
  onCollect,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";
  const { canSend, sendCollectionInvoice } = useSendInvoice();

  const [payments, setPayments] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Collection | null>(null);
  const [voidTarget, setVoidTarget] = useState<Collection | null>(null);

  const chargeId = charge?.id ?? null;
  const load = useCallback(async () => {
    if (!chargeId) return;
    setLoading(true);
    try {
      setPayments(await collectionService.getPaymentsForCharge(chargeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [chargeId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  if (!charge) return null;

  const source = snapshotCurrency(charge, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const live = payments.filter((p) => p.voidedAt === null);
  const collected = live.reduce((sum, p) => sum + itemAmount(p, charge.id), 0);
  const balance = charge.amount - collected;
  const settled = balance <= 0;
  const partial = collected > 0 && balance > 0;

  const userName = (id: string | null) =>
    users.find((u) => u.id === id)?.fullName ?? t("common.unknown");

  const sendable = !!recipient && canSend(recipient.phone);

  async function handleSend(collection: Collection) {
    if (!recipient) return;
    await sendCollectionInvoice({
      phone: recipient.phone,
      customerName: recipient.name,
      collection,
    });
  }

  function paymentActions(target: Collection): ActionMenuItem[] {
    const actions: ActionMenuItem[] = [];
    if (sendable) {
      actions.push({
        key: "invoice",
        label: t("invoicing.send_on_whatsapp"),
        icon: "logo-whatsapp",
        onPress: () => {
          setMenuFor(null);
          void handleSend(target);
        },
      });
    }
    actions.push({
      key: "void",
      label: t("ledger.void_payment"),
      icon: "trash-outline",
      destructive: true,
      onPress: () => {
        setVoidTarget(target);
        setMenuFor(null);
      },
    });
    return actions;
  }

  return (
    <FormSheet visible={visible} onDismiss={onDismiss} title={label}>
      <View className="gap-5 px-4 pb-8">
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

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

        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("ledger.payments_count", { count: live.length })}
          </Text>
          {loading ? (
            <ActivityIndicator />
          ) : payments.length === 0 ? (
            <Text className="py-2 text-sm text-slate-500">{t("ledger.no_payments_yet")}</Text>
          ) : (
            payments.map((p) => {
              const paidHere = itemAmount(p, charge.id);
              const coversMore = (p.items?.length ?? 0) > 1;
              const voided = p.voidedAt !== null;
              return (
                <View
                  key={p.id}
                  className={`flex-row items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 ${
                    voided ? "opacity-50" : ""
                  }`}
                >
                  <Ionicons name="cash-outline" size={18} color={COLORS.success} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">
                      {money(paidHere)}
                    </Text>
                    <Text className="text-xs text-slate-500">
                      {formatDateTimeShort(p.receivedAt, locale)} · {userName(p.receivedByUserId)}
                      {/* Say so when this money also settled other bills — that
                          is exactly what makes voiding it a wider decision. */}
                      {coversMore ? ` · ${t("ledger.covers_others")}` : ""}
                      {voided ? ` · ${t("ledger.voided")}` : ""}
                    </Text>
                  </View>
                  {!voided && (
                    <PressableOpacity onPress={() => setMenuFor(p)} className="p-1">
                      <Ionicons name="ellipsis-vertical" size={16} color={COLORS.gray500} />
                    </PressableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {!settled && onCollect && (
          <Button
            label={t("ledger.collect_remaining", { amount: money(balance) })}
            onPress={() => onCollect(charge)}
          />
        )}
      </View>

      <ActionMenu
        visible={menuFor !== null}
        onDismiss={() => setMenuFor(null)}
        actions={menuFor ? paymentActions(menuFor) : []}
      />

      {voidTarget && user && (
        <VoidCollectionDialog
          collection={voidTarget}
          voidedBy={user.id}
          onDone={() => {
            setVoidTarget(null);
            void load();
            onChanged?.();
          }}
          onDismiss={() => setVoidTarget(null)}
        />
      )}
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
