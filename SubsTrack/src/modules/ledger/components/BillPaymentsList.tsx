import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Collection } from "@/src/core/types";
import { formatDateTime } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { useAuth } from "@/src/modules/authentication/auth";
import { useSendInvoice } from "@/src/modules/invoicing";
import { collectionService } from "../services/CollectionService";
import { VoidCollectionDialog } from "./VoidCollectionDialog";

interface Props {
  chargeId: string | null;
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
  visible: boolean;
  billVoided?: boolean;
  recipient?: { name: string; phone: string | null } | null;
  onChanged?: (voided: Collection) => void;
  onCollectedChange?: (collected: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Every payment that has reached ONE bill, with its own date, collector and
 * 3-dot menu (send receipt / void this hand-over).
 *
 * Shared by the month `BillSheet` and the sale receipt, because a month and a
 * sale are the same thing to the ledger: one `charges` row that any number of
 * `collections` can settle. Voiding a row here says THAT hand-over was wrong and
 * leaves the bill owed — voiding the bill itself is the owner's own action.
 *
 * `billVoided` makes the whole list a record: voiding the bill already took its
 * cash, so every row reads voided and nothing here can be acted on again.
 */
export function BillPaymentsList({
  chargeId,
  snapshot,
  visible,
  billVoided = false,
  recipient,
  onChanged,
  onCollectedChange,
  onLoadingChange,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const { canSend, sendCollectionInvoice } = useSendInvoice();

  const [payments, setPayments] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Collection | null>(null);
  const [voidTarget, setVoidTarget] = useState<Collection | null>(null);
  const loading = payments === null;

  const load = useCallback(async () => {
    if (!chargeId) {
      setPayments([]);
      return;
    }
    try {
      setPayments(await collectionService.getPaymentsForCharge(chargeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayments([]);
    }
  }, [chargeId]);

  useEffect(() => {
    setPayments(null);
  }, [chargeId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const source = snapshotCurrency(snapshot, currencies);
  const money = (v: number) => formatMoney(v, source, source);

  const rows = payments ?? [];
  const live = rows.filter((p) => p.voidedAt === null);
  const collected = live.reduce((sum, p) => sum + itemAmount(p, chargeId), 0);

  useEffect(() => {
    onCollectedChange?.(collected);
  }, [collected, onCollectedChange]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

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
      {error ? (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      ) : null}

      <Text
        fontWeight="SemiBold"
        className="text-xs uppercase tracking-wide text-gray-500"
      >
        {t("ledger.payments_count", {
          count: billVoided ? rows.length : live.length,
        })}
      </Text>

      {billVoided && rows.length > 0 ? (
        <Text className="text-xs text-gray-500">
          {t("ledger.bill_voided_payments_hint")}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator />
      ) : rows.length === 0 ? (
        <Text className="py-2 text-sm text-gray-500">
          {t("ledger.no_payments_yet")}
        </Text>
      ) : (
        rows.map((p) => {
          const paidHere = itemAmount(p, chargeId);
          const coversMore = (p.items?.length ?? 0) > 1;
          const voided = billVoided || p.voidedAt !== null;
          return (
            <View
              key={p.id}
              className={`flex-row items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 ${
                voided ? "opacity-50" : ""
              }`}
            >
              <Ionicons
                name="cash-outline"
                size={18}
                color={voided ? COLORS.gray500 : COLORS.success}
              />
              <View className="flex-1">
                <Text
                  fontWeight="SemiBold"
                  className={`text-sm ${
                    voided ? "text-gray-400 line-through" : "text-gray-900"
                  }`}
                >
                  {money(paidHere)}
                </Text>
                <Text className="text-xs text-gray-500">
                  {formatDateTime(p.receivedAt)} ·{" "}
                  {userName(p.receivedByUserId)}
                  {coversMore ? ` · ${t("ledger.covers_others")}` : ""}
                  {voided ? ` · ${t("ledger.voided")}` : ""}
                </Text>
              </View>
              {!voided && (
                <PressableOpacity onPress={() => setMenuFor(p)} className="p-1">
                  <Ionicons
                    name="ellipsis-vertical"
                    size={16}
                    color={COLORS.gray500}
                  />
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
          onBillChargeId={chargeId}
          onDone={(voided) => {
            setVoidTarget(null);
            setPayments((prev) =>
              (prev ?? []).map((p) => (p.id === voided.id ? voided : p)),
            );
            onChanged?.(voided);
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
