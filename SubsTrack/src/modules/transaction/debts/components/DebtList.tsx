import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { OpenItem } from "@/src/core/types";
import { DebtItemCard } from "./DebtItemCard";

interface Props {
  /** Bills with money still owed on them — the debts proper. */
  items: OpenItem[];
  /**
   * Plain unpaid months: OWED, but not a debt. They get their own muted section
   * because they belong to the month grid's workflow, not to chasing arrears.
   */
  unpaidMonths?: OpenItem[];
  loading?: boolean;
  // Message shown when there is nothing to list.
  emptyMessage?: string;
  onCollect?: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  /** Tapping a row opens the record behind it. Omit for a read-only list. */
  onOpenItem?: (item: OpenItem) => void;
  /** Key of the row whose record is being fetched, so it shows a spinner. */
  openingItemKey?: string | null;
}

/** Stable across a virtual month too, which has no charge id yet. */
function rowKey(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

/**
 * The shared debt-list body, oldest due date first.
 *
 * Sorted by DUE DATE, not by when the row was recorded: a debts list is read to
 * answer "what is furthest behind", and the waterfall settles them in the same
 * order — so the list reads exactly as the money will flow.
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
}: Props) {
  const { t } = useTranslation();
  const isEmpty = items.length === 0 && unpaidMonths.length === 0;

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
      {items.map((item) => (
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
          {unpaidMonths.map((item) => (
            <DebtItemCard
              key={rowKey(item)}
              item={item}
              hideCustomerName
              muted
              onCollect={onCollect}
            />
          ))}
        </>
      )}
    </>
  );
}
