import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import { useCollectionsListSlice } from "@/src/state/hooks/useCollectionsListSlice";
import { getStore } from "@/src/state/globalStore";

interface Props {
  // One id for a single hand-over, or many for a bulk void.
  collectionIds: string[];
  voidedBy: string;
  onVoided: () => void;
  onDismiss: () => void;
}

// Void confirmation (with an optional reason) for the money-in history. Backed
// by the collections slice, which patches the rows in place so a voided
// hand-over stays visible and merely stops counting.
export function CollectionsVoidDialog({
  collectionIds,
  voidedBy,
  onVoided,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const voidCollections = useCollectionsListSlice((s) => s.voidCollections);
  const error = useCollectionsListSlice((s) => s.error);
  const clearError = useCollectionsListSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  const count = collectionIds.length;

  async function handleConfirm() {
    if (count === 0) return;
    await voidCollections(collectionIds, voidedBy, reason);
    if (!getStore().getState().collections.error) {
      setReason("");
      onVoided();
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
      title={t("payments.bulk_void_title", { count })}
      message={t("payments.bulk_void_message", { count })}
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
