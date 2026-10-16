import { ActivityIndicator, Modal, View } from "react-native";
import { PressableOpacity } from "./PressableOpacity";
import { useState, type ReactNode } from "react";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { useTranslation } from "react-i18next";

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
  const [shownVisible, setShownVisible] = useState(visible);

  if (visible !== shownVisible) {
    setShownVisible(visible);
    if (!visible) setLoading(false);
  }

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
        <View className="bg-white rounded-[28px] p-6 w-full max-w-sm elevation-lg">
          <Text fontWeight="SemiBold" className="text-xl text-gray-900 mb-3">
            {title}
          </Text>
          <Text className="text-base text-gray-600 mb-5">{message}</Text>
          {children ? <View className="mb-5">{children}</View> : null}
          <View className="flex-row flex-wrap justify-end items-center gap-2">
            {!hideCancel ? (
              <PressableOpacity
                onPress={onCancel}
                disabled={cancelIsDisabled}
                containerClassName={`rounded-full ${cancelIsDisabled ? "opacity-40" : ""}`}
                className="min-h-12 px-4 items-center justify-center"
              >
                <Text fontWeight="SemiBold" className="text-base text-primary">
                  {cancelLabel ?? t("common.cancel")}
                </Text>
              </PressableOpacity>
            ) : null}
            <PressableOpacity
              onPress={handleConfirm}
              disabled={confirmIsDisabled}
              rippleColor={COLORS.rippleOnDark}
              containerClassName={`rounded-full ${confirmIsDisabled ? "opacity-40" : ""} ${destructive ? "bg-danger" : "bg-primary"}`}
              className="min-h-12 px-6 items-center justify-center"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text fontWeight="SemiBold" className="text-base text-white">
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
