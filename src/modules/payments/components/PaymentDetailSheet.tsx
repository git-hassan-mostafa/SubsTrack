import { Modal, Pressable, Text, View } from 'react-native';
import type { MonthEntry } from '@/src/core/types';
import { formatCurrency } from '@/src/core/utils/date';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  onVoid?: () => void;
  onDismiss: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PaymentDetailSheet({ visible, entry, onVoid, onDismiss }: Props) {
  const { isAdmin } = useAuth();
  const payment = entry?.payment;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">Payment</Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-primary font-medium">Close</Text>
          </Pressable>
        </View>

        <View className="px-6 pt-6">
          <View className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 items-center">
            <Text className="text-2xl font-bold text-success">
              {payment ? formatCurrency(payment.amount) : '—'}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              {entry?.label} {entry?.year}
            </Text>
          </View>

          {payment ? (
            <View className="gap-4">
              <Row label="Paid on" value={formatDate(payment.paidAt)} />
              {payment.notes ? <Row label="Notes" value={payment.notes} /> : null}
            </View>
          ) : null}

          {isAdmin && onVoid ? (
            <Pressable
              onPress={onVoid}
              className="mt-8 border border-danger rounded-lg py-3 items-center"
            >
              <Text className="text-danger font-semibold">Void Payment</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-3 border-b border-gray-100">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900 flex-1 text-right ml-4">{value}</Text>
    </View>
  );
}
