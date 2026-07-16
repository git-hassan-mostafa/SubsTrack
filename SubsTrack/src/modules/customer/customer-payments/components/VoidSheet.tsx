import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import type { CustomerPlan, MonthEntry } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { getStore } from "@/src/state/globalStore";
import { COLORS } from "@/src/shared/constants";
import { getBlockRangeLabel } from "../utils/blockRangeLabel";

interface Props {
  entry: MonthEntry | null;
  lines: CustomerPlan[];
  year: number;
  graceDays: number;
  onDismiss: () => void;
}

export function VoidSheet({ entry, lines, year, graceDays, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const voidPayment = usePaymentSlice((s) => s.voidPayment);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    if (!user || !entry?.payment) return;
    await voidPayment(
      entry.payment.id,
      user.id,
      reason,
      lines,
      year,
      graceDays,
    );
    if (!getStore().getState().payments.error) {
      setReason("");
      onDismiss();
    }
  }

  function handleDismiss() {
    setReason("");
    clearError();
    onDismiss();
  }

  const payment = entry?.payment;
  const isMultiMonth = (payment?.durationMonths ?? 1) > 1;

  const blockRangeLabel = payment
    ? getBlockRangeLabel(payment.billingMonth, payment.durationMonths, t)
    : (() => {
        const monthLabel = entry?.label ? t(`months.${entry.label}`) : "";
        return `${monthLabel} ${entry?.year ?? ""}`.trim();
      })();

  const title = isMultiMonth
    ? t("payments.void_block_title")
    : t("payments.void_payment");

  const message = isMultiMonth
    ? t("payments.void_block_warning", { blockRange: blockRangeLabel })
    : t("payments.void_warning", { monthYear: blockRangeLabel });

  return (
    <ConfirmDialog
      visible
      title={title}
      message={message}
      confirmLabel={
        isMultiMonth
          ? t("payments.void_block_confirm")
          : t("payments.void_payment")
      }
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
