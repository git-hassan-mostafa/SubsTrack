import { ActivityIndicator, View } from "react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppTextInput,
  NOTE_FIELD_STYLE,
} from "@/src/shared/components/AppTextInput";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { SharedBillsWarning } from "./SharedBillsWarning";
import { useSharedBills } from "../hooks/useSharedBills";

interface Props {
  chargeIds: string[];
  title: string;
  message: string;
  confirmLabel: string;
  error?: string | null;
  onClearError?: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  onDismiss: () => void;
}

/**
 * THE void confirm — a month bill and a sale both wear it, so the two can never
 * disagree about what voiding asks for or warns about (gotcha #153).
 *
 * It owns the reason text and the shared-bill lookup; the caller owns the
 * wording and the write. The confirm stays disabled until the lookup answers,
 * because offering the void before the warning arrives is how it gets missed.
 */
export function VoidConfirmDialog({
  chargeIds,
  title,
  message,
  confirmLabel,
  error,
  onClearError,
  onConfirm,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const field = useTextField(reason, setReason);
  const { bills, checking } = useSharedBills(chargeIds);

  return (
    <ConfirmDialog
      visible
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      confirmDisabled={checking}
      destructive
      onConfirm={() => onConfirm(reason.trim())}
      onCancel={onDismiss}
    >
      {checking ? (
        <View className="mb-3 items-start">
          <ActivityIndicator />
        </View>
      ) : null}
      {bills.length > 0 ? (
        <View className="mb-3">
          <SharedBillsWarning bills={bills} />
        </View>
      ) : null}
      {error ? (
        <View className="mb-2">
          <ErrorBanner message={error} onDismiss={onClearError} />
        </View>
      ) : null}
      <AppTextInput
        {...field}
        placeholder={t("sales.void_reason_placeholder")}
        multiline
        numberOfLines={3}
        onFocus={onClearError}
        style={NOTE_FIELD_STYLE}
        placeholderTextColor={COLORS.gray400}
      />
    </ConfirmDialog>
  );
}
