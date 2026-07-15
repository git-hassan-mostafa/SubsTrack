import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { COLORS } from '@/src/shared/constants';
import { EntityCard } from '@/src/shared/components/EntityCard';
import { findCurrency, formatMoney } from '@/src/core/utils/currency';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import { useUiPrefStore } from '@/src/shared/lib/uiPrefStore';
import type { CollectorWallet } from '@/src/core/types';

interface Props {
  wallet: CollectorWallet;
  onPress: () => void;
  /** Opens the row's action menu (e.g. "Receive all"). */
  onMenu?: () => void;
  /** Shows a spinner in place of the menu icon while a settle is in flight. */
  menuLoading?: boolean;
}

// One row on the admin Wallets screen: a collector who is holding cash, with the
// total they owe the business (USD, formatted into the display currency). Tapping
// opens their wallet detail; the trailing menu offers "Receive all" without
// opening the detail. Deactivated collectors are dimmed but still shown.
export function CollectorWalletCard({ wallet, onPress, onMenu, menuLoading }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const { displayCurrencyId } = useUiPrefStore();
  const target = findCurrency(currencies, displayCurrencyId);

  return (
    <EntityCard
      icon="wallet-outline"
      iconColor={COLORS.primary}
      iconBgClassName="bg-indigo-50"
      dimmed={!wallet.active}
      onPress={onPress}
      onMenu={onMenu}
      menuLoading={menuLoading}
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
          {wallet.collectorName}
        </Text>
        <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>
          {t('wallet.transactions_count', { count: wallet.itemCount })}
        </Text>
      </View>

      <View className="items-end ms-2">
        <Text fontWeight="Bold" className="text-base text-gray-900">
          {formatMoney(wallet.totalUsd, null, target)}
        </Text>
        {wallet.byCurrency.length > 1 ? (
          <Text className="text-[11px] text-gray-400 mt-0.5">
            {t('wallet.currencies_count', { count: wallet.byCurrency.length })}
          </Text>
        ) : null}
      </View>
    </EntityCard>
  );
}
