import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/src/shared/components/PageHeader';
import { ErrorBanner } from '@/src/shared/components/ErrorBanner';
import { confirm } from '@/src/shared/lib/confirm';
import { ConfirmDialog } from '@/src/shared/components/ConfirmDialog';
import { LoadingScreen } from '@/src/shared/components/LoadingScreen';
import { Text } from '@/src/shared/components/Text';
import { COLORS } from '@/src/shared/constants';
import { useAuthSlice } from '@/src/state/hooks/useAuthSlice';
import { useSubscriptionSlice } from '@/src/state/hooks/useSubscriptionSlice';
import { tierService } from '../services/TierService';
import { TierCard } from '../components/TierCard';
import { UsageBar } from '../components/UsageBar';
import type { TierPlan, TierResource } from '@/src/core/types';

export function SubscriptionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthSlice((s) => s.user);
  const setUserTier = useAuthSlice((s) => s.setUserTier);

  const tiers = useSubscriptionSlice((s) => s.tiers);
  const currentTier = useSubscriptionSlice((s) => s.currentTier);
  const usage = useSubscriptionSlice((s) => s.usage);
  const loading = useSubscriptionSlice((s) => s.loading);
  const upgrading = useSubscriptionSlice((s) => s.upgrading);
  const error = useSubscriptionSlice((s) => s.error);
  const upgrade = useSubscriptionSlice((s) => s.upgrade);
  const refreshUsage = useSubscriptionSlice((s) => s.refreshUsage);
  const clearError = useSubscriptionSlice((s) => s.clearError);

  const [pendingTier, setPendingTier] = useState<TierPlan | null>(null);
  const [downgradeBlockers, setDowngradeBlockers] = useState<
    { resource: TierResource; current: number; limit: number }[]
  >([]);

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => a.sortOrder - b.sortOrder),
    [tiers],
  );

  const otherTiers = useMemo(
    () => sortedTiers.filter((tier) => tier.id !== currentTier?.id),
    [sortedTiers, currentTier],
  );

  if (!user) return null;
  if (loading && tiers.length === 0) return <LoadingScreen />;

  function getDirection(tier: TierPlan): 'upgrade' | 'downgrade' | 'current' {
    if (!currentTier || tier.id === currentTier.id) return 'current';
    return tier.sortOrder > currentTier.sortOrder ? 'upgrade' : 'downgrade';
  }

  async function handleAction(tier: TierPlan) {
    if (!currentTier || !user) return;
    if (tier.sortOrder < currentTier.sortOrder) {
      const freshUsage = await refreshUsage();
      const result = tierService.canDowngradeTo(tier, freshUsage);
      if (!result.ok) {
        setDowngradeBlockers(result.blockers);
        setPendingTier(tier);
        return;
      }
    }
    const isDowngrade = tier.sortOrder < currentTier.sortOrder;
    const ok = await confirm({
      title: isDowngrade
        ? t('subscription.confirm_downgrade_title', { name: tier.name })
        : t('subscription.confirm_upgrade_title', { name: tier.name }),
      message: isDowngrade
        ? t('subscription.confirm_downgrade_body')
        : t('subscription.confirm_upgrade_body'),
      confirmLabel: isDowngrade
        ? t('subscription.confirm_downgrade')
        : t('subscription.confirm_upgrade'),
    });
    if (!ok) return;
    const tenant = await upgrade(user.tenantId, tier.id);
    if (tenant.tier) setUserTier(tenant.tier);
  }

  function cancelSwap() {
    setPendingTier(null);
    setDowngradeBlockers([]);
  }

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
          <View className="bg-white rounded-2xl mb-4 overflow-hidden border border-gray-100">
            <View className="bg-primary px-5 pt-4 pb-5">
              <View className="flex-row items-center justify-between mb-3">
                <View className="bg-white/20 rounded-full px-2.5 py-0.5 flex-row items-center">
                  <Ionicons
                    name="shield-checkmark"
                    size={11}
                    color={COLORS.white}
                  />
                  <Text className="text-[10px] font-semibold uppercase text-white ms-1">
                    {t('subscription.current_plan')}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-end justify-between">
                <Text fontWeight="Bold" className="text-white text-2xl">
                  {currentTier.name}
                </Text>
                <View className="flex-row items-baseline">
                  <Text fontWeight="Bold" className="text-white text-2xl">
                    ${currentTier.priceMonthlyUsd}
                  </Text>
                  <Text className="text-white/80 text-xs ms-1">
                    {t('subscription.per_month')}
                  </Text>
                </View>
              </View>
            </View>
            <View className="px-5 pt-4 pb-4">
              <View className="flex-row items-center mb-3">
                <Ionicons name="analytics" size={14} color={COLORS.gray500} />
                <Text className="text-sm text-gray-500 ms-1.5">
                  {t('subscription.your_usage')}
                </Text>
              </View>
              <UsageBar resource="customers" current={usage.customers} limit={currentTier.maxCustomers} />
              <UsageBar resource="users"     current={usage.users}     limit={currentTier.maxUsers} />
              <UsageBar resource="plans"     current={usage.plans}     limit={currentTier.maxPlans} />
              <UsageBar resource="branches"  current={usage.branches}  limit={currentTier.maxBranches} />
              <UsageBar resource="currencies" current={usage.currencies} limit={currentTier.maxCurrencies} />
              <UsageBar resource="products"  current={usage.products}  limit={currentTier.maxProducts} />
            </View>
          </View>
        ) : null}

        {otherTiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            isCurrent={false}
            direction={getDirection(tier)}
            onAction={handleAction}
            disabled={upgrading}
          />
        ))}

        {!currentTier
          ? sortedTiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                isCurrent={false}
                direction={getDirection(tier)}
                onAction={handleAction}
                disabled={upgrading}
              />
            ))
          : null}
      </ScrollView>

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
