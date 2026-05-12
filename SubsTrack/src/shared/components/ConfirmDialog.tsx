import { Modal, Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { Text } from '@/src/shared/components/Text';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  hideCancel?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-6 w-full">
          <Text className="text-lg font-semibold text-gray-900 mb-2">{title}</Text>
          <Text className="text-sm text-gray-600 mb-4">{message}</Text>
          {children ? <View className="mb-4">{children}</View> : null}
          <View className="flex-row gap-3">
            {!hideCancel ? (
              <Pressable
                onPress={onCancel}
                className="flex-1 border border-gray-300 rounded-lg py-3 items-center"
              >
                <Text className="text-gray-700 font-medium">{cancelLabel ?? t('common.cancel')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onConfirm}
              disabled={confirmDisabled}
              className={`flex-1 rounded-lg py-3 items-center ${confirmDisabled ? 'opacity-40' : ''} ${destructive ? 'bg-danger' : 'bg-primary'}`}
            >
              <Text className="text-white font-medium">{confirmLabel ?? t('common.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
