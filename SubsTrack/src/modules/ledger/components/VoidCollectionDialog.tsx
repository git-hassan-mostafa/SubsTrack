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
import type { Collection } from "@shared/core/types";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";
import { voidPaymentsNotice } from "@shared/modules/ledger/utils/sharedBills";
import { SharedBillsWarning } from "./SharedBillsWarning";

interface Props {
  collection: Collection;
  voidedBy: string;
  onBillChargeId?: string | null;
  onDone: (voided: Collection) => void;
  onDismiss: () => void;
}

// Undoes ONE hand-over whole; an emptied month bill stays and reads unpaid (#106).
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
  const field = useTextField(reason, setReason);

  const notice = voidPaymentsNotice([collection], onBillChargeId, t);

  async function handleConfirm() {
    const voided = await voidCollection(
      collection,
      voidedBy,
      reason.trim() || null,
    );
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
      title={notice.title}
      message={notice.message}
      confirmLabel={t("ledger.void_payment")}
      destructive
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {notice.bills.length > 0 ? (
        <View className="mb-3">
          <SharedBillsWarning bills={notice.bills} />
        </View>
      ) : null}
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
