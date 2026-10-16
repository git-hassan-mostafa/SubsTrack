import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { EntityCard } from "@/src/shared/components/EntityCard";
import {
  CardAmount,
  CardChips,
  CardMeta,
  CardSubtitle,
  CardTitle,
} from "@/src/shared/components/CardText";
import { Chip } from "@/src/shared/components/Chip";
import { formatMoney } from "@shared/core/utils/currency";
import { useDisplayCurrency } from "@shared/state/hooks/useDisplayCurrency";
import type { UserWallet } from "@shared/core/types";

interface Props {
  wallet: UserWallet;
  onPress: () => void;
  onMenu?: () => void;
  menuLoading?: boolean;
}

// own wallet is listed (marked "You") though they can never receive from it
export function WalletCard({ wallet, onPress, onMenu, menuLoading }: Props) {
  const { t } = useTranslation();
  const target = useDisplayCurrency();

  return (
    <EntityCard
      avatarName={wallet.holderName}
      dimmed={!wallet.active}
      onPress={onPress}
      onMenu={onMenu}
      menuLoading={menuLoading}
    >
      <View className="flex-1 me-2">
        <CardTitle numberOfLines={1}>{wallet.holderName}</CardTitle>
        <CardSubtitle className="mt-0.5" numberOfLines={1}>
          {t("wallet.transactions_count", { count: wallet.itemCount })}
        </CardSubtitle>
        {wallet.isSelf || !wallet.active ? (
          <CardChips>
            {wallet.isSelf ? (
              <Chip text={t("wallet.you")} tone="indigo" />
            ) : null}
            {!wallet.active ? (
              <Chip text={t("common.inactive")} tone="gray" />
            ) : null}
          </CardChips>
        ) : null}
      </View>

      <View className="items-end ms-2">
        <CardAmount>{formatMoney(wallet.totalUsd, null, target)}</CardAmount>
        {wallet.byCurrency.length > 1 ? (
          <CardMeta className="mt-0.5">
            {t("wallet.currencies_count", { count: wallet.byCurrency.length })}
          </CardMeta>
        ) : null}
      </View>
    </EntityCard>
  );
}
