import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { OpenItem } from "@/src/core/types";
import { compareOpenItems } from "@/src/modules/ledger/utils/waterfall";
import { DebtItemCard } from "./DebtItemCard";

interface Props {
  items: OpenItem[];
  unpaidMonths?: OpenItem[];
  loading?: boolean;
  emptyMessage?: string;
  onCollect?: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onOpenItem?: (item: OpenItem) => void;
  openingItemKey?: string | null;
  newestFirst?: boolean;
}

/** Stable across a virtual month too, which has no charge id yet. */
function rowKey(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

/**
 * Newest first — the exact reverse of the waterfall's own order, so it stays a
 * total order and two devices still list identically. Never re-sorted on a
 * different key, or the list and the money would tell different stories.
 */
function newestFirstSort(items: OpenItem[]): OpenItem[] {
  return [...items].sort((a, b) => -compareOpenItems(a, b));
}

/**
 * The shared debt-list body, oldest due date first.
 *
 * Sorted by DUE DATE, not by when the row was recorded: a debts list is read to
 * answer "what is furthest behind", and the waterfall settles them in the same
 * order — so the list reads exactly as the money will flow. `newestFirst` flips
 * it for a single-customer sheet, where recent activity is the question.
 */
export function DebtList({
  items,
  unpaidMonths = [],
  loading = false,
  emptyMessage,
  onCollect,
  onVoidItem,
  onWriteOff,
  onOpenItem,
  openingItemKey,
  newestFirst = false,
}: Props) {
  const { t } = useTranslation();
  const isEmpty = items.length === 0 && unpaidMonths.length === 0;
  const rows = newestFirst ? newestFirstSort(items) : items;
  const monthRows = newestFirst ? newestFirstSort(unpaidMonths) : unpaidMonths;

  if (loading && isEmpty) {
    return (
      <View className="py-6 items-center">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View className="py-6 items-center">
        <Text className="text-sm text-gray-400">
          {emptyMessage ?? t("debts.no_transactions_for_customer")}
        </Text>
      </View>
    );
  }

  return (
    <>
      {rows.map((item) => (
        <DebtItemCard
          key={rowKey(item)}
          item={item}
          hideCustomerName
          onCollect={onCollect}
          onVoid={onVoidItem}
          onWriteOff={onWriteOff}
          onOpen={onOpenItem}
          loading={openingItemKey === rowKey(item)}
        />
      ))}

      {unpaidMonths.length > 0 && (
        <>
          <Text className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("ledger.unpaid_months_section")}
          </Text>
          {monthRows.map((item) => (
            <DebtItemCard
              key={rowKey(item)}
              item={item}
              hideCustomerName
              muted
              onCollect={onCollect}
              onOpen={onOpenItem}
              loading={openingItemKey === rowKey(item)}
            />
          ))}
        </>
      )}
    </>
  );
}
