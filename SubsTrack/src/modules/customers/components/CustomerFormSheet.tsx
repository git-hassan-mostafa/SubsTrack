import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { useTranslation } from 'react-i18next';
import { Button } from '@/src/shared/components/Button';
import { DatePickerInput } from '@/src/shared/components/DatePickerInput';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { Input } from '@/src/shared/components/Input';
import type { Customer, Plan } from '@/src/core/types';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { usePlanStore } from '@/src/modules/plans/store/planStore';
import { useCustomerStore } from '../store/customerStore';

interface Props {
  visible: boolean;
  customer?: Customer | null;
  onDismiss: () => void;
}

export function CustomerFormSheet({ visible, customer, onDismiss }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { createCustomer, updateCustomer, loading, error, clearError } = useCustomerStore();
  const { plans, fetchPlans } = usePlanStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    if (visible) {
      setName(customer?.name ?? '');
      setPhone(customer?.phoneNumber ?? '');
      setAddress(customer?.address ?? '');
      setPlanId(customer?.planId ?? null);
      setStartDate(customer?.startDate ?? '');
      clearError();
      if (plans.length === 0) fetchPlans();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer]);

  async function handleSubmit() {
    if (!user) return;
    if (customer) {
      await updateCustomer(customer.id, {
        name, phoneNumber: phone || null, address: address || null, planId,
      });
    } else {
      await createCustomer(
        { name, phoneNumber: phone || null, address: address || null, planId, startDate },
        user.tenantId,
      );
    }
    if (!useCustomerStore.getState().error) onDismiss();
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
            {customer ? t('customers.edit_title') : t('customers.add_title')}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-base text-gray-400">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder={t('customers.name_placeholder')}
            onFocus={clearError}
          />

          {/* Phone + Start Date side by side */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 000 0000"
                keyboardType="phone-pad"
              />
            </View>
            {!customer ? (
              <View className="flex-1">
                <DatePickerInput
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            ) : null}
          </View>

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Optional"
          />

          {/* Plan radio cards */}
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Plan</Text>
          <View className="gap-2 mb-6">
            {/* No plan option */}
            <Pressable
              onPress={() => setPlanId(null)}
              className={`flex-row items-center border rounded-xl px-4 py-3.5 ${planId === null ? 'border-primary bg-indigo-50' : 'border-gray-200 bg-white'}`}
            >
              <View className={`w-5 h-5 rounded-full border-2 me-3 items-center justify-center ${planId === null ? 'border-primary' : 'border-gray-300'}`}>
                {planId === null ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
              </View>
              <View>
                <Text className={`text-base font-semibold ${planId === null ? 'text-primary' : 'text-gray-900'}`}>
                  No plan
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">Custom amount each payment</Text>
              </View>
            </Pressable>

            {plans.map((p: Plan) => (
              <Pressable
                key={p.id}
                onPress={() => setPlanId(p.id)}
                className={`flex-row items-center border rounded-xl px-4 py-3.5 ${planId === p.id ? 'border-primary bg-indigo-50' : 'border-gray-200 bg-white'}`}
              >
                <View className={`w-5 h-5 rounded-full border-2 me-3 items-center justify-center ${planId === p.id ? 'border-primary' : 'border-gray-300'}`}>
                  {planId === p.id ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
                </View>
                <View>
                  <Text className={`text-base font-semibold ${planId === p.id ? 'text-primary' : 'text-gray-900'}`}>
                    {p.name}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {p.isCustomPrice ? 'Custom pricing' : `$${p.price} / month`}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          <Button
            label={customer ? t('common.save_changes') : t('customers.add_title')}
            onPress={handleSubmit}
            loading={loading}
            disabled={!name.trim() || (!customer && !startDate)}
            fullWidth
          />
          <View className="h-4" />
        </ScrollView>
      </View>
    </Modal>
  );
}
