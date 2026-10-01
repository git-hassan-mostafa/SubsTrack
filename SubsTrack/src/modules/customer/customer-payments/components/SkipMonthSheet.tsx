import { useState } from "react";
import { View } from "react-native";
import {
  AppTextInput,
  NOTE_FIELD_STYLE,
} from "@/src/shared/components/AppTextInput";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Text } from "@/src/shared/components/Text";
import type { CustomerPlan, MonthEntry } from "@shared/core/types";
import { useSkipMonths } from "@shared/modules/customer/customer-payments/hooks/useSkipMonths";
import {
  skipText,
  type SkipMode,
} from "@shared/modules/customer/customer-payments/utils/skipText";
import { COLORS } from "@/src/shared/constants";
import { useTextField } from "@/src/shared/hooks/useTextField";

interface Props {
  entries: MonthEntry[];
  mode: SkipMode;
  customerId: string;
  line: CustomerPlan;
  onDone: () => void;
  onDismiss: () => void;
}

// Skipping takes an optional note; unskipping only confirms and shows it.
export function SkipMonthSheet({
  entries,
  mode,
  customerId,
  line,
  onDone,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const skip = useSkipMonths(customerId, line.id);
  const [note, setNote] = useState("");
  const field = useTextField(note, setNote);
  const text = skipText(entries, mode, t);

  async function handleConfirm() {
    if (!(await skip.submit(entries, mode, note))) return;
    setNote("");
    onDone();
  }

  function handleDismiss() {
    setNote("");
    skip.clearError();
    onDismiss();
  }

  return (
    <ConfirmDialog
      visible
      title={text.title}
      message={text.message}
      confirmLabel={text.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleDismiss}
    >
      {skip.error ? (
        <View className="mb-2">
          <ErrorBanner message={skip.error} onDismiss={skip.clearError} />
        </View>
      ) : null}
      {mode === "skip" ? (
        <AppTextInput
          {...field}
          placeholder={t("payments.skip.note_placeholder")}
          multiline
          numberOfLines={3}
          onFocus={skip.clearError}
          style={NOTE_FIELD_STYLE}
          placeholderTextColor={COLORS.gray400}
        />
      ) : text.existingNote ? (
        <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <Text className="text-xs text-gray-500">
            {t("payments.skip.note_label")}
          </Text>
          <Text className="text-sm text-gray-800 mt-0.5">
            {text.existingNote}
          </Text>
        </View>
      ) : null}
    </ConfirmDialog>
  );
}
