import { useState } from "react";
import { View } from "react-native";
import {
  AppTextInput,
  NOTE_FIELD_STYLE,
} from "@/src/shared/components/AppTextInput";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { useCollectionsListStore } from "@/src/modules/ledger/state/collectionsListStore";

interface Props {
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
  const voidCollections = useCollectionsListStore((s) => s.voidCollections);
  const error = useCollectionsListStore((s) => s.error);
  const clearError = useCollectionsListStore((s) => s.clearError);
  const [reason, setReason] = useState("");
  const field = useTextField(reason, setReason);

  const count = collectionIds.length;

  async function handleConfirm() {
    if (count === 0) return;
    await voidCollections(collectionIds, voidedBy, reason);
    if (!useCollectionsListStore.getState().error) {
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
      <AppTextInput
        {...field}
        placeholder={t("payments.void_reason_placeholder")}
        multiline
        numberOfLines={3}
        onFocus={clearError}
        style={NOTE_FIELD_STYLE}
        placeholderTextColor={COLORS.gray400}
      />
    </ConfirmDialog>
  );
}
