import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import type { Customer, MonthEntry } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePaymentStore } from "../store/paymentStore";
import { COLORS } from "@/src/shared/constants";

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  customer: Customer;
  year: number;
  graceDays: number;
  onDismiss: () => void;
}

export function VoidSheet({
  visible,
  entry,
  customer,
  year,
  graceDays,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { voidPayment, loadingVoid, error, clearError } = usePaymentStore();
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    if (!user || !entry?.payment) return;
    await voidPayment(
      entry.payment.id,
      user.id,
      reason,
      customer,
      year,
      graceDays,
    );
    if (!usePaymentStore.getState().error) {
      setReason("");
      onDismiss();
    }
  }

  function handleDismiss() {
    setReason("");
    clearError();
    onDismiss();
  }

  const monthLabel = entry?.label ? t(`months.${entry.label}`) : "";
  const monthYear = `${monthLabel} ${entry?.year ?? ""}`.trim();

  return (
    <ConfirmDialog
      visible={visible}
      title={t("payments.void_payment")}
      message={t("payments.void_warning", { monthYear })}
      confirmLabel={loadingVoid ? "..." : t("payments.void_payment")}
      destructive
      confirmDisabled={!reason.trim() || loadingVoid}
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
