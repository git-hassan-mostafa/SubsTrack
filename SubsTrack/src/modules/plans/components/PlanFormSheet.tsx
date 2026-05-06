import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  onRequestDelete?: (plan: Plan) => void;
}

export function PlanFormSheet({ visible, plan, onDismiss, onRequestDelete }: Props) {
  const { t } = useTranslation();
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
    if (!usePlanStore.getState().error) onDismiss();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-white">
        {/* Handle + header */}
        <View className="items-center pt-3 pb-1">
          <View className="w-10 h-1 rounded-full bg-gray-300" />
        </View>
        <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <Text className="text-lg font-bold text-gray-900">
            {plan ? t('plans.edit_title') : t('plans.add_title')}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-gray-400">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label={t('plans.plan_name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('plans.plan_name_placeholder')}
            onFocus={clearError}
          />

          {!isCustomPrice ? (
            <Input
              label={t('plans.price_label')}
              value={priceText}
              onChangeText={setPriceText}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              onFocus={clearError}
            />
          ) : null}

          {/* Custom pricing toggle */}
          <View className="flex-row items-center justify-between py-4 border border-gray-100 rounded-xl px-4 mb-6">
            <View>
              <Text className="text-sm font-semibold text-gray-900">{t('plans.custom_pricing_label')}</Text>
              <Text className="text-xs text-gray-400 mt-0.5">{t('plans.custom_pricing_hint')}</Text>
            </View>
            <Switch
              value={isCustomPrice}
              onValueChange={setIsCustomPrice}
              trackColor={{ true: '#6366f1' }}
            />
          </View>

          <Button
            label={plan ? t('common.save_changes') : t('plans.add_title')}
            onPress={handleSubmit}
            loading={loading}
            disabled={!name.trim() || (!isCustomPrice && !priceText)}
            fullWidth
          />

          {/* Delete plan (edit mode only) */}
          {plan && onRequestDelete ? (
            <>
              <Pressable
                onPress={() => { onDismiss(); onRequestDelete(plan); }}
                className="border border-red-200 rounded-xl py-3.5 items-center mt-3"
              >
                <Text className="text-red-500 font-semibold">Delete plan</Text>
              </Pressable>
              <Text className="text-xs text-gray-400 text-center mt-3">
                Customers will keep their existing payment history
              </Text>
            </>
          ) : null}

          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
