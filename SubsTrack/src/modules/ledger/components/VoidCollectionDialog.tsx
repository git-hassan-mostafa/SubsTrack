import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Collection } from "@/src/core/types";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { sharedBillsOf } from "../utils/sharedBills";
import { SharedBillsWarning } from "./SharedBillsWarning";

interface Props {
  collection: Collection;
  voidedBy: string;
  onBillChargeId?: string | null;
  onDone: (voided: Collection) => void;
  onDismiss: () => void;
}

/**
 * Undo ONE hand-over of cash.
 *
 * Every bill it touched gets its balance back on its own — a balance is a sum
 * over live items and this row stops being one — so the warning names how many
 * bills that is. A month bill left at zero collected is deliberately kept: it
 * holds the frozen price, and it reads as plain "unpaid" everywhere because
 * nothing in the app asks whether a bill row exists, only how much money came.
 */
export function VoidCollectionDialog({
  collection,
  voidedBy,
  onBillChargeId = null,
  onDone,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const voidCollection = useLedgerSlice((s) => s.voidCollection);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  const shared = sharedBillsOf(collection, onBillChargeId, t);

  async function handleConfirm() {
    const voided = await voidCollection(collection, voidedBy, reason.trim() || null);
    if (voided) {
      setReason("");
      onDone(voided);
    }
  }

  function handleDismiss() {
    setReason("");
    clearError();
    onDismiss();
  }

  return (
    <ConfirmDialog
      visible
      title={t("ledger.void_payment")}
      message={
        shared.length > 0
          ? t("ledger.void_covers_many_warning", { count: shared.length + 1 })
          : t("ledger.void_warning")
      }
      confirmLabel={t("ledger.void_payment")}
      destructive
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {shared.length > 0 ? (
        <View className="mb-3">
          <SharedBillsWarning bills={shared} />
        </View>
      ) : null}
      {error ? (
        <View className="mb-2">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder={t("payments.void_reason_placeholder")}
        multiline
        numberOfLines={3}
        onFocus={clearError}
        style={{
          fontFamily: "Cairo",
          borderWidth: 1,
          borderColor: COLORS.gray200 ?? "#E5E7EB",
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 14,
          color: "#111827",
          backgroundColor: "#fff",
          textAlignVertical: "top",
        }}
        placeholderTextColor={COLORS.gray400}
      />
    </ConfirmDialog>
  );
}
