import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MonthEntry } from '@/src/core/types';
import { formatDate } from '@/src/core/utils/date';

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  onVoid?: () => void;
  onEdit?: (newAmount: number) => void;
  editLoading?: boolean;
  onDismiss: () => void;
}

export function PaymentDetailSheet({ visible, entry, onVoid, onEdit, editLoading, onDismiss }: Props) {
  const { t, i18n } = useTranslation();
  const payment = entry?.payment;

  const [editMode, setEditMode] = useState(false);
  const [amountText, setAmountText] = useState('');

  function handleOpenEdit() {
    setAmountText(payment ? String(payment.amount) : '');
    setEditMode(true);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setAmountText('');
  }

  function handleSaveEdit() {
    const val = parseFloat(amountText);
    if (!isNaN(val) && val > 0 && onEdit) {
      onEdit(val);
      setEditMode(false);
      setAmountText('');
    }
  }

  function handleDismiss() {
    setEditMode(false);
    setAmountText('');
    onDismiss();
  }

  const saveDisabled = (() => {
    const val = parseFloat(amountText);
    return isNaN(val) || val <= 0 || editLoading;
  })();

  const receiptId = payment ? payment.id.slice(-6).toUpperCase() : '—';
  const monthYear = entry?.label
    ? `${t(`months.${entry.label}`)} ${entry.year}`
    : '';

  return (
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
          <Text className="text-lg font-bold text-gray-900">Payment receipt</Text>
          <Pressable onPress={handleDismiss}>
            <Text className="text-base text-gray-400">{t('common.close')}</Text>
          </Pressable>
        </View>

        <View className="px-6 pt-5">
          {/* Green success card */}
          <View className="bg-green-50 border border-green-100 rounded-2xl px-4 py-5 items-center mb-6">
            <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center mb-3">
              <Text className="text-white text-lg font-bold">✓</Text>
            </View>
            <Text className="text-3xl font-bold text-green-600">
              ${payment?.amount.toFixed(2) ?? '—'}
            </Text>
            <Text className="text-sm text-gray-400 mt-1">{monthYear} · paid in full</Text>
          </View>

          {/* Detail rows */}
          {payment ? (
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
              <Row label={t('payments.paid_on')} value={formatDate(payment.paidAt, i18n.language)} />
              <Row label="Receipt ID" value={receiptId} />
              {payment.notes ? <Row label={t('payments.notes')} value={payment.notes} last /> : null}
            </View>
          ) : null}

          {/* Edit amount */}
          {onEdit && !editMode ? (
            <Pressable onPress={handleOpenEdit} className="border border-primary rounded-xl py-3 items-center mb-3">
              <Text className="text-primary font-semibold">{t('payments.edit_amount')}</Text>
            </Pressable>
          ) : null}

          {onEdit && editMode ? (
            <View className="mb-3">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{t('payments.amount_label')}</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder={t('payments.enter_amount')}
                placeholderTextColor="#9ca3af"
                className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 bg-white mb-3"
                autoFocus
              />
              <View className="flex-row gap-3">
                <Pressable onPress={handleCancelEdit} className="flex-1 border border-gray-200 rounded-xl py-3 items-center">
                  <Text className="text-gray-600 font-medium">{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveEdit}
                  disabled={saveDisabled}
                  className={`flex-1 rounded-xl py-3 items-center ${saveDisabled ? 'bg-gray-200' : 'bg-primary'}`}
                >
                  <Text className={`font-semibold ${saveDisabled ? 'text-gray-400' : 'text-white'}`}>
                    {editLoading ? '...' : t('common.save_changes')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Void button */}
          {onVoid && !editMode ? (
            <Pressable onPress={onVoid} className="border border-red-300 rounded-xl py-3.5 items-center">
              <Text className="text-red-500 font-semibold">Void this payment</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`flex-row justify-between items-center px-4 py-3.5 ${last ? '' : 'border-b border-gray-100'}`}>
      <Text className="text-sm text-gray-400">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right">{value}</Text>
    </View>
  );
}
