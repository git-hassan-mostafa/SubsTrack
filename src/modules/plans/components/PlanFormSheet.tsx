import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { Plan } from '@/src/core/types';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { usePlanStore } from '../store/planStore';

interface Props {
  visible: boolean;
  plan?: Plan | null;
  onDismiss: () => void;
}

export function PlanFormSheet({ visible, plan, onDismiss }: Props) {
  const { user } = useAuth();
  const { createPlan, updatePlan, loading, error, clearError } = usePlanStore();

  const [name, setName] = useState('');
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [priceText, setPriceText] = useState('');

  useEffect(() => {
    if (visible) {
      setName(plan?.name ?? '');
      setIsCustomPrice(plan?.isCustomPrice ?? false);
      setPriceText(plan?.price != null ? String(plan.price) : '');
      clearError();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, plan]);

  async function handleSubmit() {
    if (!user) return;
    const price = isCustomPrice ? null : parseFloat(priceText);
    if (plan) {
      await updatePlan(plan.id, { name, isCustomPrice, price });
    } else {
      await createPlan({ name, isCustomPrice, price }, user.tenantId);
    }
    if (!error) onDismiss();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">
            {plan ? 'Edit Plan' : 'Add Plan'}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-primary font-medium">Cancel</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Plan Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Basic, Premium"
            onFocus={clearError}
          />

          <View className="flex-row items-center justify-between mb-6 py-3 border-b border-gray-100">
            <View>
              <Text className="text-sm font-medium text-gray-700">Custom Pricing</Text>
              <Text className="text-xs text-gray-500 mt-0.5">Staff enters amount per payment</Text>
            </View>
            <Switch
              value={isCustomPrice}
              onValueChange={setIsCustomPrice}
              trackColor={{ true: '#6366f1' }}
            />
          </View>

          {!isCustomPrice ? (
            <Input
              label="Price"
              value={priceText}
              onChangeText={setPriceText}
              placeholder="0.00"
              keyboardType="decimal-pad"
              onFocus={clearError}
            />
          ) : null}

          <Button
            label={plan ? 'Save Changes' : 'Add Plan'}
            onPress={handleSubmit}
            loading={loading}
            disabled={!name.trim() || (!isCustomPrice && !priceText)}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
