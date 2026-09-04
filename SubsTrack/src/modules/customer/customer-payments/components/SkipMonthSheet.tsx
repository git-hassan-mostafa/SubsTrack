import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import type { CustomerPlan, MonthEntry } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth";
import { usePaymentSlice } from "@/src/state/hooks/usePaymentSlice";
import { getStore } from "@/src/state/globalStore";
import { COLORS } from "@/src/shared/constants";

interface Props {
  entries: MonthEntry[];
  mode: "skip" | "unskip";
  customerId: string;
  line: CustomerPlan;
  onDone: () => void;
  onDismiss: () => void;
}

/**
 * Skip / unskip confirmation. Skipping takes an optional note; unskipping only
 * confirms (and shows the note that was written, if any).
 */
export function SkipMonthSheet({
  entries,
  mode,
  customerId,
  line,
  onDone,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const setMonthsSkipped = usePaymentSlice((s) => s.setMonthsSkipped);
  const error = usePaymentSlice((s) => s.error);
  const clearError = usePaymentSlice((s) => s.clearError);
  const [note, setNote] = useState("");

  const isSkip = mode === "skip";
  const single = entries.length === 1 ? entries[0] : null;
  const monthLabel = single
    ? `${t(`months.${single.label}`)} ${single.year}`
    : String(entries.length);
  const existingNote = single?.skip?.note ?? null;

  async function handleConfirm() {
    if (!user || entries.length === 0) return;
    await setMonthsSkipped(
      entries.map((entry) => ({
        customerId,
        customerPlanId: line.id,
        billingMonth: entry.billingMonth,
        note: isSkip ? note : (entry.skip?.note ?? null),
      })),
      isSkip,
      user.tenantId,
      user.id,
    );
    if (!getStore().getState().payments.error) {
      setNote("");
      onDone();
    }
  }

  function handleDismiss() {
    setNote("");
    clearError();
    onDismiss();
  }

  return (
    <ConfirmDialog
      visible
      title={isSkip ? t("payments.skip.skip_title") : t("payments.skip.unskip_title")}
      message={
        isSkip
          ? single
            ? t("payments.skip.skip_message", { monthYear: monthLabel })
            : t("payments.skip.skip_message_many", { count: entries.length })
          : single
            ? t("payments.skip.unskip_message", { monthYear: monthLabel })
            : t("payments.skip.unskip_message_many", { count: entries.length })
      }
      confirmLabel={isSkip ? t("payments.skip.skip_action") : t("payments.skip.unskip_action")}
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {error ? (
        <View className="mb-2">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}
      {isSkip ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("payments.skip.note_placeholder")}
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
      ) : existingNote ? (
        <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <Text className="text-xs text-gray-500">{t("payments.skip.note_label")}</Text>
          <Text className="text-sm text-gray-800 mt-0.5">{existingNote}</Text>
        </View>
      ) : null}
    </ConfirmDialog>
  );
}
