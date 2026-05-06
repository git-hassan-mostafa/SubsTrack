import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
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
  const [planDropdownOpen, setPlanDropdownOpen] = useState(false);

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
        <View className="flex-row items-center justify-between px-6 py-4 border-b border-gray-100">
          <Text className="text-lg font-semibold text-gray-900">
            {customer ? t('customers.edit_title') : t('customers.add_title')}
          </Text>
          <Pressable onPress={onDismiss}>
            <Text className="text-primary font-medium">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          <Input
            label={t('customers.name_label')}
            value={name}
            onChangeText={setName}
            placeholder={t('customers.name_placeholder')}
            onFocus={clearError}
          />
          <Input
            label={t('customers.phone_optional')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('customers.phone_placeholder')}
            keyboardType="phone-pad"
          />
          <Input
            label={t('customers.address_optional')}
            value={address}
            onChangeText={setAddress}
            placeholder={t('customers.address_placeholder')}
          />

          {!customer ? (
            <DatePickerInput
              label={t('customers.start_date_label')}
              value={startDate}
              onChange={setStartDate}
              placeholder={t('customers.start_date_placeholder')}
            />
          ) : null}

          <Text className="text-sm font-medium text-gray-700 mb-1">{t('customers.plan_optional')}</Text>
          <View className="mb-4">
            <Pressable
              onPress={() => setPlanDropdownOpen((v) => !v)}
              className="border border-gray-300 rounded-lg px-4 py-3 bg-white flex-row items-center justify-between"
            >
              <Text className={`text-base ${planId ? 'text-gray-900' : 'text-gray-400'}`}>
                {planId
                  ? (plans.find((p: Plan) => p.id === planId)?.name ?? t('customers.select_plan'))
                  : t('common.no_plan')}
              </Text>
              <Text className="text-gray-400">{planDropdownOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {planDropdownOpen ? (
              <View className="border border-gray-200 rounded-lg mt-1 bg-white overflow-hidden">
                <Pressable
                  onPress={() => { setPlanId(null); setPlanDropdownOpen(false); }}
                  className={`px-4 py-3 border-b border-gray-100 ${planId === null ? 'bg-indigo-50' : ''}`}
                >
                  <Text className={`text-sm ${planId === null ? 'text-primary font-medium' : 'text-gray-600'}`}>
                    {t('common.no_plan')}
                  </Text>
                </Pressable>
                {plans.map((p: Plan, index: number) => (
                  <Pressable
                    key={p.id}
                    onPress={() => { setPlanId(p.id); setPlanDropdownOpen(false); }}
                    className={`px-4 py-3 ${index < plans.length - 1 ? 'border-b border-gray-100' : ''} ${planId === p.id ? 'bg-indigo-50' : ''}`}
                  >
                    <Text className={`text-sm ${planId === p.id ? 'text-primary font-medium' : 'text-gray-600'}`}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <Button
            label={customer ? t('common.save_changes') : t('customers.add_title')}
            onPress={handleSubmit}
            loading={loading}
            disabled={!name.trim() || (!customer && !startDate)}
            fullWidth
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
