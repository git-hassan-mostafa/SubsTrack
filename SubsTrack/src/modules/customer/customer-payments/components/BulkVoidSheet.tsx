import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import type { CustomerPlan } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { getStore } from "@/src/state/globalStore";
import { COLORS } from "@/src/shared/constants";

interface Props {
  paymentIds: string[];
  lines: CustomerPlan[];
  year: number;
  graceDays: number;
  onVoided: () => void;
  onDismiss: () => void;
}

// Voids several payments in one confirm — a single batch write via the slice's
// voidPayments action.
export function BulkVoidSheet({
  paymentIds,
  lines,
  year,
  graceDays,
  onVoided,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidPayments = usePaymentSlice((s) => s.voidPayments);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    if (!user) return;
    clearError();
    await voidPayments(paymentIds, user.id, reason, lines, year, graceDays);
    if (!getStore().getState().payments.error) {
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
      title={t("payments.bulk_void_title", { count: paymentIds.length })}
      message={t("payments.bulk_void_message", { count: paymentIds.length })}
      confirmLabel={t("payments.void_payment")}
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
