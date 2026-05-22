import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { Button } from '@/src/shared/components/Button';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { COLORS } from '@/src/shared/constants';
import type { Currency } from '@/src/core/types';
import { useCurrencyStore } from '@/src/modules/currencies/store/currencyStore';
import { CurrencyCard, UsdBaseCard } from '@/src/modules/currencies/components/CurrencyCard';
import { CurrencyFormSheet } from '@/src/modules/currencies/components/CurrencyFormSheet';

export function CurrenciesSection() {
  const { t } = useTranslation();
  const { currencies, loading, error, fetchCurrencies, deleteCurrency, clearError } =
    useCurrencyStore();

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [deleting, setDeleting] = useState<Currency | null>(null);

  useEffect(() => {
    fetchCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(currency: Currency) {
    setEditing(currency);
    setFormVisible(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await deleteCurrency(deleting.id);
    setFormVisible(false);
    setDeleting(null);
  }

  return (
    <>
      {error ? (
        <View className="mb-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

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

      {formVisible && (
        <CurrencyFormSheet
          currency={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={setDeleting}
        />
      )}

      <ConfirmDialog
        visible={!!deleting}
        title={t('tenant_settings.delete_title')}
        message={t('tenant_settings.delete_message', { code: deleting?.code ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
