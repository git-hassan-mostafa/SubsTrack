import { Modal, Pressable, View } from 'react-native';
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
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/50 items-center justify-center px-8">
        <View className="bg-white rounded-2xl p-6 w-full">
          <Text className="text-lg font-semibold text-gray-900 mb-2">{title}</Text>
          <Text className="text-sm text-gray-600 mb-6">{message}</Text>
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
              className={`flex-1 rounded-lg py-3 items-center ${destructive ? 'bg-danger' : 'bg-primary'}`}
            >
              <Text className="text-white font-medium">{confirmLabel ?? t('common.confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
