import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/src/shared/components/ConfirmDialog";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { Input } from "@/src/shared/components/Input";
import type { Customer, MonthEntry } from "@/src/core/types";
import { useAuth } from "@/src/modules/auth/hooks/useAuth";
import { usePaymentStore } from "../store/paymentStore";

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
  const [confirmVisible, setConfirmVisible] = useState(false);

  async function handleConfirm() {
    if (!user || !entry?.payment) return;
    setConfirmVisible(false);
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
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismiss}
      >
        <View className="flex-1 bg-white">
          {/* Handle + header */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-300" />
          </View>
          <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
            <Text fontWeight="Bold" className="text-lg text-red-500">
              {t("payments.void_payment")}
            </Text>
            <Pressable onPress={handleDismiss}>
              <Text className="text-base text-primary font-medium">
                {t("common.cancel")}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            className="flex-1 px-6 pt-5"
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <ErrorBanner message={error} onDismiss={clearError} />
            ) : null}

            {/* Warning banner */}
            <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3.5 flex-row items-start gap-3 mb-6">
              <Text className="text-lg mt-0.5">⚠️</Text>
              <Text className="text-sm text-gray-700 flex-1 leading-5">
                {t("payments.void_warning", { monthYear })}
              </Text>
            </View>

            <Input
              label={t("payments.void_reason_label")}
              value={reason}
              onChangeText={setReason}
              placeholder={t("payments.void_reason_placeholder")}
              multiline
              numberOfLines={3}
              onFocus={clearError}
            />

            {/* Void button */}
            <Pressable
              onPress={() => setConfirmVisible(true)}
              disabled={!reason.trim() || loadingVoid}
              className={`rounded-xl py-3.5 items-center mb-3 ${!reason.trim() || loadingVoid ? "opacity-50 bg-red-400" : "bg-red-500"}`}
            >
              <Text className="text-white font-semibold text-base">
                {loadingVoid ? "..." : t("payments.void_payment")}
              </Text>
            </Pressable>

            {/* Cancel button */}
            <Pressable
              onPress={handleDismiss}
              className="border border-gray-200 rounded-xl py-3.5 items-center"
            >
              <Text className="text-primary font-semibold text-base">
                {t("common.cancel")}
              </Text>
            </Pressable>

            <View className="h-4" />
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmVisible}
        title={t("payments.void_confirm_title")}
        message={t("payments.void_confirm_message", {
          month: monthLabel,
          year: entry?.year ?? "",
        })}
        confirmLabel={t("common.confirm")}
        destructive
        onConfirm={handleConfirm}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}
