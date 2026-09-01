import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import type { CollectionItem, CollectionListItem } from "@/src/core/types";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { formatDateTimeShort } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { CollectionItemCard } from "./CollectionItemCard";

interface Props {
  collection: CollectionListItem | null;
  onDismiss: () => void;
  /** Opens the bill behind one line — the same sheets the list itself opens. */
  onOpenItem?: (item: CollectionItem) => void;
  /** The line whose record is being fetched. */
  loadingItemId?: string | null;
}

/**
 * The bills ONE hand-over settled, each as its own card.
 *
 * A $55 payment closing two months and a sale is three rows here — the same
 * split the waterfall applied, shown rather than explained. Tapping a row opens
 * that bill exactly as tapping a single-bill hand-over in the list does.
 */
export function CollectionSplitSheet({
  collection,
  onDismiss,
  onOpenItem,
  loadingItemId,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  if (!collection) return null;

  const source = snapshotCurrency(collection, currencies);
  const display = findCurrency(currencies, displayCurrencyId);

  return (
    <FormSheet visible onDismiss={onDismiss} title={t("ledger.split_title")}>
      <View className="gap-1 px-4 pb-3">
        <Text className="text-2xl font-bold text-slate-900">
          {formatMoney(collection.amount, source, display)}
        </Text>
        <Text className="text-xs text-slate-500">
          {collection.customerName ? `${collection.customerName} · ` : ""}
          {formatDateTimeShort(collection.receivedAt, locale)}
        </Text>
        <Text className="mt-1 text-xs text-slate-500">
          {t("ledger.split_hint", { count: collection.itemCount })}
        </Text>
      </View>

      <View className="px-4 pb-6">
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
