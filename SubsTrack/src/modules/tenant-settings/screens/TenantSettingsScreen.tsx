import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { COLORS } from '@/src/shared/constants';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useCurrencyStore } from '@/src/modules/currencies/store/currencyStore';
import { useBranchStore } from '@/src/modules/branches/store/branchStore';
import { DisplayCurrencySection } from '../components/DisplayCurrencySection';
import { BranchesSection } from '../components/BranchesSection';
import { CurrenciesSection } from '../components/CurrenciesSection';

export function TenantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const currenciesLoading = useCurrencyStore((s) => s.loading);
  const branchesLoading = useBranchStore((s) => s.loading);
  const fetchCurrencies = useCurrencyStore((s) => s.fetchCurrencies);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);

  if (!user) return null;

  const refreshing = currenciesLoading || branchesLoading;
  const onRefresh = () => {
    fetchCurrencies();
    fetchBranches();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t('tenant_settings.title')}
        subtitle={t('tenant_settings.subtitle')}
        showBack
        onBack={() => router.back()}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <DisplayCurrencySection />
        <BranchesSection />
        <CurrenciesSection />
      </ScrollView>
    </SafeAreaView>
  );
}
