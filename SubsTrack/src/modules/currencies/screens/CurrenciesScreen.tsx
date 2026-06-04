import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/shared/constants';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { EmptyState } from '@/src/shared/components/EmptyState';
import { confirm } from '@/src/shared/lib/confirm';
import {
  ActionMenu,
  type ActionMenuItem,
} from '@/src/shared/components/ActionMenu';
import type { Currency } from '@/src/core/types';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import { CurrencyCard, UsdBaseCard } from '../components/CurrencyCard';
import { CurrencyFormSheet } from '../components/CurrencyFormSheet';

export function CurrenciesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currencies = useCurrencySlice((s) => s.items);
  const loading = useCurrencySlice((s) => s.loading);
  const error = useCurrencySlice((s) => s.error);
  const fetchCurrencies = useCurrencySlice((s) => s.fetchCurrencies);
  const deleteCurrency = useCurrencySlice((s) => s.deleteCurrency);
  const reactivateCurrency = useCurrencySlice((s) => s.reactivateCurrency);
  const clearError = useCurrencySlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [menuCurrency, setMenuCurrency] = useState<Currency | null>(null);

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

  async function handleDeactivateCurrency(currency: Currency) {
    const ok = await confirm({
      title: t('tenant_settings.deactivate_title'),
      message: t('tenant_settings.deactivate_message', { code: currency.code }),
      destructive: true,
    });
    if (!ok) return;
    await deleteCurrency(currency.id);
  }

  async function handleDeleteCurrency(currency: Currency) {
    const ok = await confirm({
      title: t('tenant_settings.delete_title'),
      message: t('tenant_settings.delete_message', { code: currency.code }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!ok) return;
    await deleteCurrency(currency.id);
  }

  function buildMenuActions(currency: Currency | null): ActionMenuItem[] {
    if (!currency) return [];
    const items: ActionMenuItem[] = [
      {
        key: 'edit',
        label: t('common.edit'),
        icon: 'create-outline',
        onPress: () => openEdit(currency),
      },
    ];
    if (currency.active) {
      items.push({
        key: 'deactivate',
        label: t('tenant_settings.deactivate'),
        icon: 'pause-circle-outline',
        destructive: true,
        onPress: () => void handleDeactivateCurrency(currency),
      });
    } else {
      items.push({
        key: 'reactivate',
        label: t('tenant_settings.reactivate'),
        icon: 'play-circle-outline',
        onPress: () => reactivateCurrency(currency.id),
      });
    }
    items.push({
      key: 'delete',
      label: t('common.delete'),
      icon: 'trash-outline',
      destructive: true,
      onPress: () => void handleDeleteCurrency(currency),
    });
    return items;
  }

  const activeCount = currencies.filter((c) => c.active).length;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t('tenant_settings.currencies_section_title')}
        subtitle={t('tenant_settings.currencies_count', { count: activeCount })}
        showBack
        onBack={() => router.back()}
        actionLabel={t('tenant_settings.add_currency')}
        onAction={openCreate}
      />

      {error ? (
        <View className="px-4 pt-4">
          <ErrorBanner message={error} onDismiss={clearError} />
        </View>
      ) : null}

      {loading && currencies.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={currencies}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchCurrencies}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={<UsdBaseCard />}
          renderItem={({ item }) => (
            <CurrencyCard
              currency={item}
              onEdit={openEdit}
              onMenu={setMenuCurrency}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message={t('tenant_settings.no_currencies')}
              subMessage={t('tenant_settings.no_currencies_hint')}
              actionLabel={t('tenant_settings.add_currency')}
              onAction={openCreate}
            />
          }
        />
      )}

      {formVisible && (
        <CurrencyFormSheet
          currency={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={(currency) => void handleDeleteCurrency(currency)}
        />
      )}

      <ActionMenu
        visible={menuCurrency !== null}
        title={menuCurrency?.code}
        actions={buildMenuActions(menuCurrency)}
        onDismiss={() => setMenuCurrency(null)}
      />
    </SafeAreaView>
  );
}
