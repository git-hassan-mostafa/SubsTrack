import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { Chip } from "@/src/shared/components/Chip";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { COLORS } from "@/src/shared/constants";
import type { CollectionItem, CollectionListItem } from "@shared/core/types";
import {
  findCurrency,
  formatMoneyPair,
  snapshotCurrency,
} from "@shared/core/utils/currency";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";
import { useUserNames } from "@shared/shared/hooks/useUserNames";
import { useCollectionDetail } from "@shared/modules/ledger/hooks/useCollectionDetail";
import { collectionInfoRows } from "@shared/modules/ledger/utils/collectionView";
import { CollectionItemCard } from "./CollectionItemCard";

type OpenBillHandler = (
  item: CollectionItem,
  label: string,
  customerName: string | null,
) => void;

interface Props {
  collectionId: string;
  initial?: CollectionListItem | null;
  onDismiss: () => void;
  onOpenItem?: OpenBillHandler;
  loadingItemId?: string | null;
}

// One hand-over in full; `initial` paints at once while the fresh copy loads.
export function CollectionDetailSheet({
  collectionId,
  initial = null,
  onDismiss,
  onOpenItem,
  loadingItemId = null,
}: Props) {
  const { t } = useTranslation();
  const { collection, error } = useCollectionDetail(collectionId, initial);

  return (
    <FormSheet
      visible
      onDismiss={onDismiss}
      title={t("ledger.payment_details")}
      subject={
        collection ? (collection.customerName ?? t("ledger.walk_in")) : null
      }
    >
      {error ? <ErrorBanner message={error} onDismiss={onDismiss} /> : null}
      {collection ? (
        <DetailBody
          collection={collection}
          onOpenItem={onOpenItem}
          loadingItemId={loadingItemId}
        />
      ) : !error ? (
        <View className="items-center py-16">
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : null}
    </FormSheet>
  );
}

function DetailBody({
  collection,
  onOpenItem,
  loadingItemId,
}: {
  collection: CollectionListItem;
  onOpenItem?: OpenBillHandler;
  loadingItemId: string | null;
}) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const userName = useUserNames();
  const displayCurrencyId = useDisplayCurrencyId();

  const source = snapshotCurrency(collection, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(collection.amount, source, display);
  const voided = collection.voidedAt !== null;

  return (
    <>
      <View className="items-center gap-1 pb-4 pt-2">
        <Text
          fontWeight="Bold"
          className={`text-3xl ${
            voided ? "text-gray-400 line-through" : "text-gray-900"
          }`}
        >
          {money.primary}
        </Text>
        {money.approx ? (
          <Text className="text-sm text-gray-500">{money.approx}</Text>
        ) : null}
        <View className="mt-1 flex-row items-center gap-1.5">
          <Chip
            text={t(`ledger.kind_${collection.kind}`)}
            tone="gray"
            size="md"
          />
          {voided ? (
            <Chip text={t("ledger.voided")} tone="red" size="md" />
          ) : null}
        </View>
      </View>

      <View>
        <InfoRows rows={collectionInfoRows(collection, t, userName)} />
      </View>

      <View className="pb-6 pt-5">
        <Text
          fontWeight="SemiBold"
          className="pb-2 text-xs uppercase tracking-wide text-gray-500"
        >
          {voided ? t("ledger.this_paid") : t("ledger.this_pays")}
        </Text>
        {voided ? (
          <Text className="pb-2 text-xs text-gray-500">
            {t("ledger.voided_hint")}
          </Text>
        ) : null}
        {collection.items.map((item, i) => {
          const label = collection.itemLabels[i] ?? "";
          return (
            <CollectionItemCard
              key={item.id}
              item={item}
              label={label}
              snapshot={collection}
              onOpen={
                onOpenItem
                  ? (it) => onOpenItem(it, label, collection.customerName)
                  : undefined
              }
              loading={loadingItemId === item.id}
            />
          );
        })}
      </View>
    </>
  );
}
