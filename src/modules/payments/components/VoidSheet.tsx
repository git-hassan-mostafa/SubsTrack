import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/src/shared/components/Button';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { Customer, MonthEntry } from '@/src/core/types';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { usePaymentStore } from '../store/paymentStore';

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  customer: Customer;
  year: number;
  graceDays: number;
  onDismiss: () => void;
}

export function VoidSheet({ visible, entry, customer, year, graceDays, onDismiss }: Props) {
  const { user } = useAuth();
  const { voidPayment, loadingVoid, error, clearError } = usePaymentStore();
  const [reason, setReason] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);

  async function handleConfirm() {
    if (!user || !entry?.payment) return;
    setConfirmVisible(false);
    await voidPayment(entry.payment.id, user.id, reason, customer, year, graceDays);
    if (!error) {
      setReason('');
      onDismiss();
    }
  }

  function handleDismiss() {
    setReason('');
    clearError();
    onDismiss();
  }

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleDismiss}
      >
        <View className="flex-1 bg-white">
          <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
            <Text className="text-lg font-semibold text-gray-900">Void Payment</Text>
            <Pressable onPress={handleDismiss}>
              <Text className="text-primary font-medium">Cancel</Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
            {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

            <Text className="text-sm text-gray-600 mb-6">
              Voiding this payment will mark{' '}
              <Text className="font-semibold">{entry?.label} {entry?.year}</Text>{' '}
              as unpaid. This action cannot be undone.
            </Text>

            <Input
              label="Reason (required)"
              value={reason}
              onChangeText={setReason}
              placeholder="Explain why this payment is being voided"
              multiline
              numberOfLines={3}
              onFocus={clearError}
            />

            <Button
              label="Void Payment"
              onPress={() => setConfirmVisible(true)}
              variant="danger"
              loading={loadingVoid}
              disabled={!reason.trim()}
              fullWidth
            />
          </ScrollView>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmVisible}
        title="Void Payment?"
        message={`This will mark ${entry?.label ?? ''} ${entry?.year ?? ''} as unpaid. The original payment will be retained in records.`}
        confirmLabel="Void"
        destructive
        onConfirm={handleConfirm}
        onCancel={() => setConfirmVisible(false)}
      />
    </>
  );
}
