import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MonthEntry } from '@/src/core/types';
import { formatCurrency, formatDate } from '@/src/core/utils/date';

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">{t('payments.payment_title')}</Text>
          <Pressable onPress={handleDismiss}>
            <Text className="text-primary font-medium">{t('common.close')}</Text>
          </Pressable>
        </View>

        <View className="px-6 pt-6">
          <View className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 items-center">
            <Text className="text-2xl font-bold text-success">
              {payment ? formatCurrency(payment.amount, i18n.language) : '—'}
            </Text>
            <Text className="text-sm text-gray-500 mt-1">
              {entry?.label ? t(`months.${entry.label}`) : ''} {entry?.year}
            </Text>
          </View>

          {payment ? (
            <View className="gap-4">
              <Row label={t('payments.paid_on')} value={formatDate(payment.paidAt, i18n.language)} />
              {payment.notes ? <Row label={t('payments.notes')} value={payment.notes} /> : null}
            </View>
          ) : null}

          {onEdit ? (
            editMode ? (
              <View className="mt-6">
                <Text className="text-sm font-medium text-gray-700 mb-1">{t('payments.amount_label')}</Text>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  placeholder={t('payments.enter_amount')}
                  placeholderTextColor="#9ca3af"
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 bg-white mb-3"
                  autoFocus
                />
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={handleCancelEdit}
                    className="flex-1 border border-gray-300 rounded-lg py-3 items-center"
                  >
                    <Text className="text-gray-600 font-medium">{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveEdit}
                    disabled={saveDisabled}
                    className={`flex-1 rounded-lg py-3 items-center ${saveDisabled ? 'bg-gray-200' : 'bg-primary'}`}
                  >
                    <Text className={`font-semibold ${saveDisabled ? 'text-gray-400' : 'text-white'}`}>
                      {editLoading ? '...' : t('common.save_changes')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={handleOpenEdit} className="mt-6 border border-primary rounded-lg py-3 items-center">
                <Text className="text-primary font-semibold">{t('payments.edit_amount')}</Text>
              </Pressable>
            )
          ) : null}

          {onVoid && !editMode ? (
            <Pressable
              onPress={onVoid}
              className="mt-3 border border-danger rounded-lg py-3 items-center"
            >
              <Text className="text-danger font-semibold">{t('payments.void_payment')}</Text>
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
      <Text className="text-sm font-medium text-gray-900 flex-1 ms-4">{value}</Text>
    </View>
  );
}
