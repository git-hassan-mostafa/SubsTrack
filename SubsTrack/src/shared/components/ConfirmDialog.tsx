import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { useEffect, useState, type ReactNode } from "react";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { useTranslation } from "react-i18next";
import { useWebBackDismiss } from "@/src/shared/hooks/useWebBackDismiss";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideCancel?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  hideCancel = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) setLoading(false);
  }, [visible]);

  // Web: browser Back closes the dialog (mirrors native hardware-back). Guard
  // loading so Back can't dismiss mid-confirm, matching onRequestClose below.
  useWebBackDismiss(visible, () => {
    if (!loading) onCancel();
  });

  async function handleConfirm() {
    if (loading || confirmDisabled) return;
    const result = onConfirm();
    if (!isThenable(result)) return;
    setLoading(true);
    try {
      await result;
    } finally {
      setLoading(false);
    }
  }

  const confirmIsDisabled = confirmDisabled || loading;
  const cancelIsDisabled = loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-lg font-semibold text-gray-900 mb-2">
            {title}
          </Text>
          <Text className="text-sm text-gray-600 mb-4">{message}</Text>
          {children ? <View className="mb-4">{children}</View> : null}
          <View className="flex-row gap-3">
            {!hideCancel ? (
              <PressableOpacity
                onPress={onCancel}
                disabled={cancelIsDisabled}
                className={`flex-1 border border-gray-300 rounded-lg py-3 items-center ${cancelIsDisabled ? "opacity-40" : ""}`}
              >
                <Text className="text-gray-700 font-medium">
                  {cancelLabel ?? t("common.cancel")}
                </Text>
              </PressableOpacity>
            ) : null}
            <PressableOpacity
              onPress={handleConfirm}
              disabled={confirmIsDisabled}
              className={`flex-1 rounded-lg py-3 items-center justify-center ${confirmIsDisabled ? "opacity-40" : ""} ${destructive ? "bg-danger" : "bg-primary"}`}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text className="text-white font-medium">
                  {confirmLabel ?? t("common.confirm")}
                </Text>
              )}
            </PressableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
