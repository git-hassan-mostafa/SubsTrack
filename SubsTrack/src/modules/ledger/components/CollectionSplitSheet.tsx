import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { InfoRows } from "@/src/shared/components/InfoRows";
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
import { useLanguageStore } from "@/src/core/i18n/languageStore";
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
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  if (!collection) return null;

  const source = snapshotCurrency(collection, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = formatMoneyPair(collection.amount, source, display);
  const voided = collection.voidedAt !== null;
  const userName = (id: string | null) =>
    users.find((u) => u.id === id)?.fullName ?? t("common.unknown");

  return (
    <FormSheet visible onDismiss={onDismiss} title={t("ledger.split_title")}>
      <View className="items-center gap-1 pb-4 pt-2">
        <Text
          className={`text-3xl font-bold ${
            voided ? "text-slate-400 line-through" : "text-slate-900"
          }`}
        >
          {money.primary}
        </Text>
        {money.approx ? (
          <Text className="text-sm text-slate-500">{money.approx}</Text>
        ) : null}
        {/* The kind survives a void: what it PAID FOR is still what it was. */}
        <View className="mt-1 flex-row items-center gap-1.5">
          <Pill className="bg-slate-100 text-slate-700">
            {t(`ledger.kind_${collection.kind}`)}
          </Pill>
          {voided ? (
            <Pill className="bg-red-50 text-red-700">{t("ledger.voided")}</Pill>
          ) : null}
        </View>
      </View>

      <View>
        <InfoRows
          rows={[
            {
              label: t("ledger.customer_label"),
              value: collection.customerName ?? t("ledger.walk_in"),
            },
            {
              label: t("ledger.received_at"),
              value: formatDateTime(collection.receivedAt, locale),
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
                ? formatDateTime(collection.voidedAt, locale)
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
        <Text className="pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {voided ? t("ledger.this_paid") : t("ledger.this_pays")}
        </Text>
        {voided ? (
          <Text className="pb-2 text-xs text-slate-500">
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

function Pill({
  children,
  className,
}: {
  children: string;
  className: string;
}) {
  return (
    <Text
      className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </Text>
  );
}
