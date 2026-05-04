import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { Customer, MonthEntry } from '@/src/core/types';
import { formatCurrency } from '@/src/core/utils/date';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { usePaymentStore } from '../store/paymentStore';

interface Props {
  visible: boolean;
  entry: MonthEntry | null;
  customer: Customer;
  graceDays: number;
  onDismiss: () => void;
}

export function PaymentFormSheet({ visible, entry, customer, graceDays, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createPayment, loadingCreate, error, clearError } = usePaymentStore();

  const [customAmountText, setCustomAmountText] = useState('');
  const [isOverrideEnabled, setIsOverrideEnabled] = useState(false);
  const [amountMode, setAmountMode] = useState<'plan' | 'custom'>('plan');

  if (!entry) return null;

  const plan = customer.plan;
  const isFixedPlan = !!plan && !plan.isCustomPrice;
  const isCustomOrNoPlan = !plan || plan.isCustomPrice;

  const resolvedAmount = (() => {
    if (isFixedPlan && !isOverrideEnabled) return plan!.price!;
    if (isFixedPlan && isOverrideEnabled && amountMode === 'plan') return plan!.price!;
    const v = parseFloat(customAmountText);
    return isNaN(v) ? null : v;
  })();

  const canSubmit = resolvedAmount !== null && resolvedAmount > 0 && !loadingCreate;

  async function handleSubmit() {
    if (!user || !canSubmit || loadingCreate) return;
    await createPayment(
      {
        billingMonth: entry!.billingMonth,
        amount: resolvedAmount!,
        customerId: customer.id,
        planId: customer.planId,
        receivedByUserId: user.id,
        tenantId: user.tenantId,
      },
      customer,
      graceDays,
    );
    if (!error) {
      setCustomAmountText('');
      setIsOverrideEnabled(false);
      setAmountMode('plan');
      onDismiss();
    }
  }

  function handleDismiss() {
    setCustomAmountText('');
    setIsOverrideEnabled(false);
    setAmountMode('plan');
    clearError();
    onDismiss();
  }

  const monthLabel = t(`months.${entry.label}`);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">{t('payments.record_payment')}</Text>
          <Pressable onPress={handleDismiss}>
            <Text className="text-primary font-medium">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Text className="text-sm text-gray-500 mb-1">{t('payments.month_label')}</Text>
          <Text className="text-base font-semibold text-gray-900 mb-6">
            {monthLabel} {entry.year}
          </Text>

          {isFixedPlan && !isOverrideEnabled ? (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('payments.amount_label')}</Text>
              <View className="border border-gray-200 rounded-lg px-4 py-3 bg-gray-50 flex-row items-center justify-between">
                <Text className="text-base text-gray-900">{formatCurrency(plan!.price!)}</Text>
                <Text className="text-xs text-gray-400">{plan!.name}</Text>
              </View>
              <Pressable onPress={() => setIsOverrideEnabled(true)} className="mt-2">
                <Text className="text-primary text-sm">{t('payments.override_amount')}</Text>
              </Pressable>
            </View>
          ) : null}

          {isFixedPlan && isOverrideEnabled ? (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-3">{t('payments.amount_label')}</Text>
              <View className="gap-2 mb-3">
                {(['plan', 'custom'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setAmountMode(mode)}
                    className={`flex-row items-center border rounded-lg px-4 py-3 ${amountMode === mode ? 'border-primary bg-indigo-50' : 'border-gray-200'}`}
                  >
                    <View className={`w-4 h-4 rounded-full border-2 me-3 items-center justify-center ${amountMode === mode ? 'border-primary' : 'border-gray-400'}`}>
                      {amountMode === mode ? <View className="w-2 h-2 rounded-full bg-primary" /> : null}
                    </View>
                    <Text className="text-sm text-gray-700">
                      {mode === 'plan'
                        ? t('payments.plan_price', { price: formatCurrency(plan!.price!) })
                        : t('payments.custom_amount')}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {amountMode === 'custom' ? (
                <Input
                  value={customAmountText}
                  onChangeText={setCustomAmountText}
                  placeholder={t('payments.enter_amount')}
                  keyboardType="decimal-pad"
                  onFocus={clearError}
                />
              ) : null}
            </View>
          ) : null}

          {isCustomOrNoPlan ? (
            <Input
              label={t('payments.amount_label')}
              value={customAmountText}
              onChangeText={setCustomAmountText}
              placeholder={t('payments.enter_amount')}
              keyboardType="decimal-pad"
              onFocus={clearError}
            />
          ) : null}

          <Button
            label={t('payments.record_payment')}
            onPress={handleSubmit}
            loading={loadingCreate}
            disabled={!canSubmit}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
