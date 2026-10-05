import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Collection } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useSendInvoice } from "@/src/modules/invoicing";
import { paidToCharge } from "@shared/modules/ledger/utils/paidToCharge";
import { PAYMENT_ACTION_ICONS } from "../utils/paymentActionIcons";
import { paymentMenuItems } from "@shared/modules/ledger/utils/collectionView";
import { toActionMenuItems } from "@/src/shared/lib/menuActions";
import type { CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import { useBillPayments } from "@shared/modules/ledger/hooks/useBillPayments";
import { CollectionDetailSheet } from "./CollectionDetailSheet";
import { CorrectCollectionSheet } from "./CorrectCollectionSheet";
import { VoidCollectionDialog } from "./VoidCollectionDialog";

interface Props {
  chargeId: string | null;
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
  visible: boolean;
  billVoided?: boolean;
  recipient?: { name: string; phone: string | null } | null;
  onChanged?: (voided: Collection, replacement?: Collection) => void;
  onCollectedChange?: (collected: number) => void;
  onPaymentsChange?: (payments: Collection[]) => void;
  onLoadingChange?: (loading: boolean) => void;
}

// Every payment on ONE bill; voiding a row leaves the bill owed — gotcha #109.
export function BillPaymentsList({
  chargeId,
  snapshot,
  visible,
  billVoided = false,
  recipient,
  onChanged,
  onCollectedChange,
  onPaymentsChange,
  onLoadingChange,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const userName = useUserNames();
  const { canSend, sendCollectionInvoice } = useSendInvoice();

  const bill = useBillPayments(chargeId, visible);
  const { payments: rows, live, collected, loading, error, clearError } = bill;
  const [menuFor, setMenuFor] = useState<Collection | null>(null);
  const [voidTarget, setVoidTarget] = useState<Collection | null>(null);
  const [correctTarget, setCorrectTarget] = useState<Collection | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const source = snapshotCurrency(snapshot, currencies);
  const money = (v: number) => formatMoney(v, source, source);

  useEffect(() => {
    onCollectedChange?.(collected);
  }, [collected, onCollectedChange]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (!loading) onPaymentsChange?.(rows);
  }, [loading, rows, onPaymentsChange]);

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
    return toActionMenuItems(
      paymentMenuItems(target, { sendable, billVoided }),
      t,
      {
        icons: PAYMENT_ACTION_ICONS,
        run: {
          invoice: () => void handleSend(target),
          correct: () => setCorrectTarget(target),
          void: () => setVoidTarget(target),
        },
      },
    );
  }

  function handleCorrected(correction: CollectionCorrection) {
    setCorrectTarget(null);
    bill.markCorrected(correction);
    onChanged?.(correction.voided, correction.replacement);
  }

  return (
    <View className="gap-2">
      {error ? (
        <ErrorBanner message={error} onDismiss={clearError} />
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
          const paidHere = paidToCharge(p, chargeId);
          const coversMore = (p.items?.length ?? 0) > 1;
          const voided = billVoided || p.voidedAt !== null;
          return (
            <PressableOpacity
              key={p.id}
              onPress={() => setDetailId(p.id)}
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
                  {userName(p.receivedByUserId) ?? t("common.unknown")}
                  {coversMore ? ` · ${t("ledger.covers_others")}` : ""}
                  {voided ? ` · ${t("ledger.voided")}` : ""}
                </Text>
                {p.notes ? (
                  <Text
                    numberOfLines={2}
                    className="mt-1 text-xs text-gray-500"
                  >
                    {p.notes}
                  </Text>
                ) : null}
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
            </PressableOpacity>
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
            bill.markVoided(voided);
            onChanged?.(voided);
          }}
          onDismiss={() => setVoidTarget(null)}
        />
      )}

      {detailId && (
        <CollectionDetailSheet
          collectionId={detailId}
          onDismiss={() => setDetailId(null)}
        />
      )}

      {correctTarget && (
        <CorrectCollectionSheet
          collectionId={correctTarget.id}
          onDone={handleCorrected}
          onDismiss={() => setCorrectTarget(null)}
        />
      )}
    </View>
  );
}
