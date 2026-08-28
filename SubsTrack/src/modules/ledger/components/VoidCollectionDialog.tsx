import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { Collection } from "@/src/core/types";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";

interface Props {
  collection: Collection;
  voidedBy: string;
  /** Fired only when the void actually landed. */
  onDone: () => void;
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
export function VoidCollectionDialog({ collection, voidedBy, onDone, onDismiss }: Props) {
  const { t } = useTranslation();
  const voidCollection = useLedgerSlice((s) => s.voidCollection);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  const count = collection.items?.length ?? 1;

  async function handleConfirm() {
    const ok = await voidCollection(collection.id, voidedBy, reason.trim() || null);
    if (ok) {
      setReason("");
      onDone();
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
        count > 1
          ? t("ledger.void_covers_many_warning", { count })
          : t("ledger.void_warning")
      }
      confirmLabel={t("ledger.void_payment")}
      destructive
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
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
