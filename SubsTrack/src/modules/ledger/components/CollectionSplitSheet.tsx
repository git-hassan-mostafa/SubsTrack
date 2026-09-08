import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { InfoRows } from "@/src/shared/components/InfoRows";
import { Chip } from "@/src/shared/components/Chip";
import type { CollectionItem, CollectionListItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoneyPair,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDateTime } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { CollectionItemCard } from "./CollectionItemCard";

interface Props {
  collection: CollectionListItem | null;
  onDismiss: () => void;
  onOpenItem?: (item: CollectionItem) => void;
  loadingItemId?: string | null;
}

export function CollectionSplitSheet({
  collection,
  onDismiss,
  onOpenItem,
  loadingItemId,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const users = useUserSlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();

  if (!collection) return null;

  const source = snapshotCurrency(collection, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(collection.amount, source, display);
  const voided = collection.voidedAt !== null;
  const userName = (id: string | null) =>
    users.find((u) => u.id === id)?.fullName ?? t("common.unknown");

  return (
    <FormSheet
      visible
      onDismiss={onDismiss}
      title={t("ledger.split_title")}
      subject={collection.customerName ?? t("ledger.walk_in")}
    >
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
        <InfoRows
          rows={[
            {
              label: t("ledger.received_at"),
              value: formatDateTime(collection.receivedAt),
            },
            {
              label: t("ledger.collected_by"),
              value: userName(collection.receivedByUserId),
            },
            {
              label: t("ledger.held_by"),
              value: voided
                ? null
                : collection.heldByUserId === null
                  ? t("ledger.banked")
                  : userName(collection.heldByUserId),
            },
            { label: t("ledger.notes"), value: collection.notes },
            {
              label: t("ledger.voided_at"),
              value: collection.voidedAt
                ? formatDateTime(collection.voidedAt)
                : null,
            },
            {
              label: t("ledger.voided_by"),
              value: collection.voidedBy ? userName(collection.voidedBy) : null,
            },
            {
              label: t("ledger.void_reason_label"),
              value: collection.voidReason,
            },
          ]}
        />
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
        {collection.items.map((item, i) => (
          <CollectionItemCard
            key={item.id}
            item={item}
            label={collection.itemLabels[i] ?? ""}
            snapshot={collection}
            onOpen={onOpenItem}
            loading={loadingItemId === item.id}
          />
        ))}
      </View>
    </FormSheet>
  );
}

