import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { ActionMenu, type ActionMenuItem } from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Collection } from "@/src/core/types";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSendInvoice } from "@/src/modules/invoicing";
import { collectionService } from "../services/CollectionService";
import { VoidCollectionDialog } from "./VoidCollectionDialog";

interface Props {
  /** The bill to list hand-overs for. Null while it does not exist yet. */
  chargeId: string | null;
  /** The bill's own currency + frozen rate — every amount is printed in it. */
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
  /** Reload when the sheet holding this list opens. */
  visible: boolean;
  /** Who the receipt goes to. Omit to hide the WhatsApp action. */
  recipient?: { name: string; phone: string | null } | null;
  /** Money moved in here — the owner of the record refreshes its own view. */
  onChanged?: () => void;
  /**
   * How much live money has reached this bill, reported after every load so the
   * owner prints its own 'collected out of owed' hero without a second read.
   */
  onCollectedChange?: (collected: number) => void;
}

/**
 * Every payment that has reached ONE bill, with its own date, collector and
 * 3-dot menu (send receipt / void this hand-over).
 *
 * Shared by the month `BillSheet` and the sale receipt, because a month and a
 * sale are the same thing to the ledger: one `charges` row that any number of
 * `collections` can settle. Voiding a row here says THAT hand-over was wrong and
 * leaves the bill owed — voiding the bill itself is the owner's own action.
 */
export function BillPaymentsList({
  chargeId,
  snapshot,
  visible,
  recipient,
  onChanged,
  onCollectedChange,
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

  const load = useCallback(async () => {
    if (!chargeId) {
      setPayments([]);
      return;
    }
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

  const source = snapshotCurrency(snapshot, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);

  const live = payments.filter((p) => p.voidedAt === null);
  const collected = live.reduce((sum, p) => sum + itemAmount(p, chargeId), 0);

  useEffect(() => {
    onCollectedChange?.(collected);
  }, [collected, onCollectedChange]);

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
    <View className="gap-2">
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("ledger.payments_count", { count: live.length })}
      </Text>

      {loading ? (
        <ActivityIndicator />
      ) : payments.length === 0 ? (
        <Text className="py-2 text-sm text-slate-500">{t("ledger.no_payments_yet")}</Text>
      ) : (
        payments.map((p) => {
          const paidHere = itemAmount(p, chargeId);
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
                <Text className="text-sm font-semibold text-slate-900">{money(paidHere)}</Text>
                <Text className="text-xs text-slate-500">
                  {formatDateTimeShort(p.receivedAt, locale)} · {userName(p.receivedByUserId)}
                  {/* Say so when this money also settled other bills — that is
                      exactly what makes voiding it a wider decision. */}
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
    </View>
  );
}

/** What one hand-over put against THIS bill — it may have covered others too. */
function itemAmount(collection: Collection, chargeId: string | null): number {
  return (collection.items ?? [])
    .filter((i) => i.chargeId === chargeId)
    .reduce((sum, i) => sum + i.amount, 0);
}
