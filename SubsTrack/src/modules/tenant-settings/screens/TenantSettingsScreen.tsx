import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { Dropdown, type DropdownOption } from '@/src/shared/components/Dropdown';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { Text } from '@/src/shared/components/Text';
import { Button } from '@/src/shared/components/Button';
import { COLORS } from '@/src/shared/constants';
import type { Currency } from '@/src/core/types';
import { useCurrencyStore } from '@/src/modules/currencies/store/currencyStore';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useUiPrefStore } from '@/src/shared/lib/uiPrefStore';
import { CurrencyCard, UsdBaseCard } from '@/src/modules/currencies/components/CurrencyCard';
import { CurrencyFormSheet } from '@/src/modules/currencies/components/CurrencyFormSheet';

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const { displayCurrencyId, setDisplayCurrencyId } = useUiPrefStore();
  const {
    currencies,
    loading,
    error,
    fetchCurrencies,
    deleteCurrency,
    clearError,
  } = useCurrencyStore();

  const [formVisible, setFormVisible] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [deletingCurrency, setDeletingCurrency] = useState<Currency | null>(null);

  useEffect(() => {
    fetchCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayCurrencyOptions: DropdownOption<string>[] = useMemo(
    () =>
      currencies
        .filter((c) => c.active)
        .map((c) => ({ label: c.code, sublabel: c.name, value: c.id })),
    [currencies],
  );

  function openCreate() {
    setEditingCurrency(null);
    setFormVisible(true);
  }

  function openEdit(currency: Currency) {
    setEditingCurrency(currency);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deletingCurrency) return;
    await deleteCurrency(deletingCurrency.id);
    setFormVisible(false);
    setDeletingCurrency(null);
  }

  if (!user) return null;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t('tenant_settings.title')}
        subtitle={t('tenant_settings.subtitle')}
        showBack
        onBack={() => router.back()}
      />

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchCurrencies}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── Display currency (per-user preference) ─────────────────── */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            {t('tenant_settings.display_section_title')}
          </Text>
          <Text className="text-xs text-gray-500 mb-3">
            {t('tenant_settings.display_currency_hint')}
          </Text>
          <Dropdown<string>
            label={t('tenant_settings.display_currency_label')}
            placeholder="USD"
            options={displayCurrencyOptions}
            value={displayCurrencyId}
            onChange={(value) => setDisplayCurrencyId(value)}
            nullable
            nullLabel="USD"
            nullSublabel={t('tenant_settings.usd_base_note')}
          />
        </View>

        {/* ── Currencies CRUD ────────────────────────────────────────── */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {t('tenant_settings.currencies_section_title')}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">
                {t('tenant_settings.currencies_hint')}
              </Text>
            </View>
            <Button
              label={t('tenant_settings.add_currency')}
              onPress={openCreate}
              variant="primary"
            />
          </View>

          <UsdBaseCard />

          {loading && currencies.length === 0 ? (
            <View className="items-center py-6">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : currencies.length === 0 ? (
            <EmptyState
              message={t('tenant_settings.no_currencies')}
              subMessage={t('tenant_settings.no_currencies_hint')}
            />
          ) : (
            currencies.map((c) => (
              <CurrencyCard key={c.id} currency={c} onEdit={openEdit} />
            ))
          )}
        </View>
      </ScrollView>

      {formVisible && (
        <CurrencyFormSheet
          currency={editingCurrency}
          onDismiss={() => {
            setFormVisible(false);
            setEditingCurrency(null);
          }}
          onRequestDelete={setDeletingCurrency}
        />
      )}

      <ConfirmDialog
        visible={!!deletingCurrency}
        title={t('tenant_settings.delete_title')}
        message={t('tenant_settings.delete_message', {
          code: deletingCurrency?.code ?? '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingCurrency(null)}
      />
    </SafeAreaView>
  );
}
