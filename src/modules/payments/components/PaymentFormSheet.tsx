import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
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
  const { user } = useAuth();
  const { createPayment, loadingCreate, error, clearError } = usePaymentStore();

  const [customAmountText, setCustomAmountText] = useState('');
  const [isOverrideEnabled, setIsOverrideEnabled] = useState(false);
  const [amountMode, setAmountMode] = useState<'plan' | 'custom'>('plan');

  if (!entry) return null;

  const plan = customer.plan;
  const isFixedPlan = !!plan && !plan.isCustomPrice;
  const isCustomOrNoPlan = !plan || plan.isCustomPrice;

  // Resolve the final amount to submit
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">Record Payment</Text>
          <Pressable onPress={handleDismiss}>
            <Text className="text-primary font-medium">Cancel</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Text className="text-sm text-gray-500 mb-1">Month</Text>
          <Text className="text-base font-semibold text-gray-900 mb-6">
            {entry.label} {entry.year}
          </Text>

          {/* Scenario A — Fixed plan, read-only */}
          {isFixedPlan && !isOverrideEnabled ? (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-1">Amount</Text>
              <View className="border border-gray-200 rounded-lg px-4 py-3 bg-gray-50 flex-row items-center justify-between">
                <Text className="text-base text-gray-900">{formatCurrency(plan!.price!)}</Text>
                <Text className="text-xs text-gray-400">{plan!.name}</Text>
              </View>
              <Pressable onPress={() => setIsOverrideEnabled(true)} className="mt-2">
                <Text className="text-primary text-sm">Override amount</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Scenario B — Fixed plan + override toggle */}
          {isFixedPlan && isOverrideEnabled ? (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-3">Amount</Text>
              <View className="gap-2 mb-3">
                {(['plan', 'custom'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setAmountMode(mode)}
                    className={`flex-row items-center border rounded-lg px-4 py-3 ${amountMode === mode ? 'border-primary bg-indigo-50' : 'border-gray-200'}`}
                  >
                    <View className={`w-4 h-4 rounded-full border-2 mr-3 items-center justify-center ${amountMode === mode ? 'border-primary' : 'border-gray-400'}`}>
                      {amountMode === mode ? <View className="w-2 h-2 rounded-full bg-primary" /> : null}
                    </View>
                    <Text className="text-sm text-gray-700">
                      {mode === 'plan' ? `Plan price (${formatCurrency(plan!.price!)})` : 'Custom amount'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {amountMode === 'custom' ? (
                <Input
                  value={customAmountText}
                  onChangeText={setCustomAmountText}
                  placeholder="Enter amount"
                  keyboardType="decimal-pad"
                  onFocus={clearError}
                />
              ) : null}
            </View>
          ) : null}

          {/* Scenario C — Custom plan or no plan */}
          {isCustomOrNoPlan ? (
            <Input
              label="Amount"
              value={customAmountText}
              onChangeText={setCustomAmountText}
              placeholder="Enter amount"
              keyboardType="decimal-pad"
              onFocus={clearError}
            />
          ) : null}

          <Button
            label="Record Payment"
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
