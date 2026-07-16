import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { useAuth } from "@/src/modules/authentication/auth";
import { usePaymentsListSlice } from "@/src/state/hooks/usePaymentsListSlice";
import { getStore } from "@/src/state/globalStore";
import { COLORS } from "@/src/shared/constants";

interface Props {
  // One id for a single payment, or many for a bulk void.
  paymentIds: string[];
  onVoided: () => void;
  onDismiss: () => void;
}

// Void confirmation (with optional reason) for the tenant-wide Payments list.
// Backed by the paymentsList slice — unlike the customer grid's VoidSheet it
// has no customer/year/grid context to rebuild.
export function PaymentListVoidSheet({
  paymentIds,
  onVoided,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidPayments = usePaymentsListSlice((s) => s.voidPayments);
  const error = usePaymentsListSlice((s) => s.error);
  const clearError = usePaymentsListSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  const count = paymentIds.length;

  async function handleConfirm() {
    if (!user || count === 0) return;
    await voidPayments(paymentIds, user.id, reason);
    if (!getStore().getState().paymentsList.error) {
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
