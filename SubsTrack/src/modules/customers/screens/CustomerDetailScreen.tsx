import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import type { MonthEntry } from '@/src/core/types';
import { getCurrentYearMonth } from '@/src/core/utils/date';
import { useAuth } from '@/src/modules/auth/hooks/useAuth';
import { MonthGrid } from '@/src/modules/payments/components/MonthGrid';
import { PaymentDetailSheet } from '@/src/modules/payments/components/PaymentDetailSheet';
import { PaymentFormSheet } from '@/src/modules/payments/components/PaymentFormSheet';
import { VoidSheet } from '@/src/modules/payments/components/VoidSheet';
import { YearNavigator } from '@/src/modules/payments/components/YearNavigator';
import { usePaymentStore } from '@/src/modules/payments/store/paymentStore';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { useCustomerStore } from '../store/customerStore';

const DEFAULT_GRACE_DAYS = 0;

export function CustomerDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const { selectedCustomer, loading: cLoading, error: cError, fetchCustomer, deactivateCustomer, reactivateCustomer, clearError: clearCError } = useCustomerStore();
  const { monthGrid, loading: pLoading, error: pError, fetchPayments, clearError: clearPError, reset: resetPayments } = usePaymentStore();

  const [year, setYear] = useState(getCurrentYearMonth().year);
  const [editVisible, setEditVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<MonthEntry | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [voidVisible, setVoidVisible] = useState(false);
  const [toggleConfirmVisible, setToggleConfirmVisible] = useState(false);

  useEffect(() => {
    if (id) fetchCustomer(id);
    return () => resetPayments();
  }, [id]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchPayments(selectedCustomer.id, year, selectedCustomer, DEFAULT_GRACE_DAYS);
    }
  }, [selectedCustomer, year]);

  function handleCellPress(entry: MonthEntry) {
    setSelectedEntry(entry);
    if (entry.status === 'paid' && entry.payment) {
      setDetailVisible(true);
    } else {
      setFormVisible(true);
    }
  }

  function handleVoidPress() {
    setDetailVisible(false);
    setVoidVisible(true);
  }

  async function handleToggleActiveConfirmed() {
    if (!selectedCustomer) return;
    setToggleConfirmVisible(false);
    if (selectedCustomer.active) {
      await deactivateCustomer(selectedCustomer.id);
    } else {
      await reactivateCustomer(selectedCustomer.id);
    }
  }

  const customer = selectedCustomer;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="me-3 py-1">
          <Text className="text-primary font-medium text-base">{t('common.back')}</Text>
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 flex-1" numberOfLines={1}>
          {customer?.name ?? ''}
        </Text>
        {isAdmin ? (
          <Pressable onPress={() => setEditVisible(true)} className="ms-2">
            <Text className="text-primary font-medium text-sm">{t('common.edit')}</Text>
          </Pressable>
        ) : null}
      </View>

      {(cError || pError) ? (
        <View className="px-4 pt-4">
          {cError ? <ErrorBanner message={cError} onDismiss={clearCError} /> : null}
          {pError ? <ErrorBanner message={pError} onDismiss={clearPError} /> : null}
        </View>
      ) : null}

      {cLoading && !customer ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : customer ? (
        <ScrollView className="flex-1">
          <View className="bg-white mx-4 mt-4 rounded-lg p-4 border border-gray-100">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-medium text-gray-500">{t('customers.plan_label')}</Text>
              <Text className="text-sm text-gray-900">{customer.plan?.name ?? t('common.no_plan')}</Text>
            </View>
            {customer.phoneNumber ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium text-gray-500">{t('customers.phone_label')}</Text>
                <Text className="text-sm text-gray-900">{customer.phoneNumber}</Text>
              </View>
            ) : null}
            {customer.address ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium text-gray-500">{t('customers.address_label')}</Text>
                <Text className="text-sm text-gray-900 flex-1 ms-4">{customer.address}</Text>
              </View>
            ) : null}
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-500">{t('customers.status_label')}</Text>
              <Pressable onPress={() => setToggleConfirmVisible(true)} className="flex-row items-center gap-2">
                <View className={`w-2 h-2 rounded-full ${customer.active ? 'bg-success' : 'bg-gray-400'}`} />
                <Text className={`text-sm font-medium ${customer.active ? 'text-success' : 'text-gray-500'}`}>
                  {customer.active ? t('common.active') : t('common.inactive')}
                </Text>
                <Text className="text-xs text-primary">{t('common.tap_to_change')}</Text>
              </Pressable>
            </View>
          </View>

          <View className="mx-4 mt-4 bg-white rounded-lg border border-gray-100 overflow-hidden">
            <YearNavigator
              year={year}
              minYear={new Date(customer.startDate).getFullYear()}
              onPrev={() => setYear((y) => y - 1)}
              onNext={() => setYear((y) => y + 1)}
            />
            {pLoading ? (
              <View className="h-40 items-center justify-center">
                <ActivityIndicator color="#6366f1" />
              </View>
            ) : (
              <MonthGrid months={monthGrid} onCellPress={handleCellPress} />
            )}
          </View>

          <View className="h-8" />
        </ScrollView>
      ) : null}

      {customer ? (
        <>
          <CustomerFormSheet
            visible={editVisible}
            customer={customer}
            onDismiss={() => setEditVisible(false)}
          />
          <PaymentFormSheet
            visible={formVisible}
            entry={selectedEntry}
            customer={customer}
            graceDays={DEFAULT_GRACE_DAYS}
            onDismiss={() => setFormVisible(false)}
          />
          <PaymentDetailSheet
            visible={detailVisible}
            entry={selectedEntry}
            onVoid={isAdmin ? handleVoidPress : undefined}
            onDismiss={() => setDetailVisible(false)}
          />
          <VoidSheet
            visible={voidVisible}
            entry={selectedEntry}
            customer={customer}
            year={year}
            graceDays={DEFAULT_GRACE_DAYS}
            onDismiss={() => setVoidVisible(false)}
          />
          <ConfirmDialog
            visible={toggleConfirmVisible}
            title={customer.active ? t('customers.deactivate_title') : t('customers.reactivate_title')}
            message={
              customer.active
                ? t('customers.deactivate_message', { name: customer.name })
                : t('customers.reactivate_message', { name: customer.name })
            }
            destructive={customer.active}
            onConfirm={handleToggleActiveConfirmed}
            onCancel={() => setToggleConfirmVisible(false)}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}
