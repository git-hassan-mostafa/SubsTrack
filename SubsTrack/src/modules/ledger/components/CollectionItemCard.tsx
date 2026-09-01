import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { COLORS } from "@/src/shared/constants";
import type { ChargeKind, CollectionItem } from "@/src/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";

interface Props {
  item: CollectionItem;
  /** Frozen at read time by chargeLabel — never re-derived here. */
  label: string;
  /** The parent hand-over's currency; an item has none of its own. */
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
  onOpen?: (item: CollectionItem) => void;
  /** True while this row's record is being fetched. */
  loading?: boolean;
}

const KIND_ICON: Record<ChargeKind, keyof typeof Ionicons.glyphMap> = {
  month: "calendar-outline",
  sale: "receipt-outline",
  manual: "document-text-outline",
};

/** One bill a hand-over settled — tapping it opens that bill's own sheet. */
export function CollectionItemCard({ item, label, snapshot, onOpen, loading }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  const source = snapshotCurrency(snapshot, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const kind = item.charge?.kind ?? "manual";

  return (
    <EntityCard
      icon={KIND_ICON[kind]}
      iconColor={COLORS.success}
      iconBgClassName="bg-emerald-50"
      onPress={onOpen ? () => onOpen(item) : undefined}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-base font-semibold text-slate-900">
            {formatMoney(item.amount, source, display)}
          </Text>
          <Text className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {t(`ledger.kind_${kind}`)}
          </Text>
        </View>
        <Text className="text-xs text-slate-600" numberOfLines={1}>
          {label || "—"}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.gray600} className="ms-1 w-9" />
      ) : null}
    </EntityCard>
  );
}
