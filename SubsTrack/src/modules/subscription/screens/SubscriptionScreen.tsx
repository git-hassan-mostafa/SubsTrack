import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';
import { Text } from '@/src/shared/components/Text';
import { useAuthStore } from '@/src/modules/auth/store/authStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { tierService } from '../services/TierService';
import { TierCard } from '../components/TierCard';
import { UsageBar } from '../components/UsageBar';
import type { TierPlan, TierResource } from '@/src/core/types';

export function SubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUserTier = useAuthStore((s) => s.setUserTier);

  const { tiers, currentTier, usage, loading, upgrading, error, upgrade, clearError } =
    useSubscriptionStore();

  const [pendingTier, setPendingTier] = useState<TierPlan | null>(null);
  const [downgradeBlockers, setDowngradeBlockers] = useState<
    { resource: TierResource; current: number; limit: number }[]
  >([]);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.sortOrder - b.sortOrder),
    [tiers],
  );

  if (!user) return null;
  if (loading && tiers.length === 0) return <LoadingScreen />;

  function getDirection(tier: TierPlan): 'upgrade' | 'downgrade' | 'current' {
    if (!currentTier || tier.id === currentTier.id) return 'current';
    return tier.sortOrder > currentTier.sortOrder ? 'upgrade' : 'downgrade';
  }

  function handleAction(tier: TierPlan) {
    if (!currentTier) return;
    if (tier.sortOrder < currentTier.sortOrder) {
      // Downgrade: precheck for blockers before confirming
      const result = tierService.canDowngradeTo(tier, usage);
      if (!result.ok) {
        setDowngradeBlockers(result.blockers);
        setPendingTier(tier);
        return;
      }
    }
    setDowngradeBlockers([]);
    setPendingTier(tier);
  }

  async function confirmSwap() {
    if (!pendingTier || !user) return;
    const tenant = await upgrade(user.tenantId, pendingTier.id);
    if (tenant.tier) setUserTier(tenant.tier);
    setPendingTier(null);
    setDowngradeBlockers([]);
  }

  function cancelSwap() {
    setPendingTier(null);
    setDowngradeBlockers([]);
  }

  const isDowngrade =
    pendingTier && currentTier ? pendingTier.sortOrder < currentTier.sortOrder : false;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t('subscription.title')}
        subtitle={t('subscription.subtitle')}
        showBack
        onBack={() => router.back()}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {currentTier ? (
          <View className="bg-white rounded-2xl p-5 mb-4 border border-gray-100">
            <Text className="text-sm text-gray-500 mb-3">
              {t('subscription.your_usage')}
            </Text>
            <UsageBar resource="customers" current={usage.customers} limit={currentTier.maxCustomers} />
            <UsageBar resource="users"     current={usage.users}     limit={currentTier.maxUsers} />
            <UsageBar resource="plans"     current={usage.plans}     limit={currentTier.maxPlans} />
            <UsageBar resource="branches"  current={usage.branches}  limit={currentTier.maxBranches} />
            <UsageBar resource="currencies" current={usage.currencies} limit={currentTier.maxCurrencies} />
          </View>
        ) : null}

        {sortedTiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            isCurrent={currentTier?.id === tier.id}
            direction={getDirection(tier)}
            onAction={handleAction}
            disabled={upgrading}
          />
        ))}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingTier && downgradeBlockers.length === 0}
        title={
          isDowngrade
            ? t('subscription.confirm_downgrade_title', { name: pendingTier?.name ?? '' })
            : t('subscription.confirm_upgrade_title', { name: pendingTier?.name ?? '' })
        }
        message={
          isDowngrade
            ? t('subscription.confirm_downgrade_body')
            : t('subscription.confirm_upgrade_body')
        }
        confirmLabel={
          isDowngrade ? t('subscription.confirm_downgrade') : t('subscription.confirm_upgrade')
        }
        onConfirm={confirmSwap}
        onCancel={cancelSwap}
      />

      <ConfirmDialog
        visible={!!pendingTier && downgradeBlockers.length > 0}
        title={t('subscription.downgrade_blocked_title')}
        message={t('subscription.downgrade_blocked_body', { name: pendingTier?.name ?? '' })}
        confirmLabel={t('common.ok')}
        hideCancel
        onConfirm={cancelSwap}
        onCancel={cancelSwap}
      >
        <View>
          {downgradeBlockers.map((b) => (
            <Text key={b.resource} className="text-sm text-gray-700 mb-1">
              {`• ${t(`subscription.resource.${b.resource}`)}: ${b.current} / ${b.limit}`}
            </Text>
          ))}
        </View>
      </ConfirmDialog>
    </SafeAreaView>
  );
}
