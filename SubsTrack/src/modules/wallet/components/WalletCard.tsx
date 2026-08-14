import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/shared/components/Text';
import { COLORS } from '@/src/shared/constants';
import { EntityCard } from '@/src/shared/components/EntityCard';
import { findCurrency, formatMoney } from '@/src/core/utils/currency';
import { useCurrencySlice } from '@/src/state/hooks/useCurrencySlice';
import { useDisplayCurrencyId } from '@/src/state/hooks/useTenantSettingSlice';
import type { UserWallet } from '@/src/core/types';

interface Props {
  wallet: UserWallet;
  onPress: () => void;
  /** Opens the row's action menu (e.g. "Receive all"). */
  onMenu?: () => void;
  /** Shows a spinner in place of the menu icon while an action is in flight. */
  menuLoading?: boolean;
}

// One row on the admin Wallets screen: someone holding cash, with the total in
// their hands (USD, formatted into the display currency). Tapping opens the
// wallet detail; the trailing menu offers the bulk action without opening it.
// The viewer's own wallet is marked "You" — it is listed like any other (they
// need to see what they carry) but they can never receive from themselves.
// Deactivated holders are dimmed but still shown.
export function WalletCard({ wallet, onPress, onMenu, menuLoading }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
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
        <View className="flex-row items-center gap-x-2">
          <Text className="text-base font-semibold text-gray-900 shrink" numberOfLines={1}>
            {wallet.holderName}
          </Text>
          {wallet.isSelf ? (
            <View className="rounded-full bg-gray-100 px-2 py-0.5">
              <Text className="text-[10px] font-semibold text-gray-500">{t('wallet.you')}</Text>
            </View>
          ) : null}
        </View>
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
