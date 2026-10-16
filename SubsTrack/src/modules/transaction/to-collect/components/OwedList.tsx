import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { SectionLabel } from "@/src/shared/components/SectionLabel";
import { COLORS } from "@/src/shared/constants";
import type { OpenItem } from "@shared/core/types";
import { sortOwed } from "@shared/modules/transaction/to-collect/utils/allItemsFilter";
import { OwedItemCard } from "./OwedItemCard";

interface Props {
  items: OpenItem[];
  unpaidMonths?: OpenItem[];
  loading?: boolean;
  emptyMessage?: string;
  onCollect?: (item: OpenItem) => void;
  onEditItem?: (item: OpenItem) => void;
  onVoidItem?: (item: OpenItem) => void;
  onWriteOff?: (item: OpenItem) => void;
  onRevertWriteOff?: (item: OpenItem) => void;
  onOpenItem?: (item: OpenItem) => void;
  openingItemKey?: string | null;
}

// Stable across a virtual month too, which has no charge id yet.
function rowKey(item: OpenItem): string {
  return item.chargeId ?? `${item.customerPlanId}:${item.billingMonth}`;
}

// Newest created first, the same order as the All debts sheet — see gotcha #74.
export function OwedList({
  items,
  unpaidMonths = [],
  loading = false,
  emptyMessage,
  onCollect,
  onEditItem,
  onVoidItem,
  onWriteOff,
  onRevertWriteOff,
  onOpenItem,
  openingItemKey,
}: Props) {
  const { t } = useTranslation();
  const isEmpty = items.length === 0 && unpaidMonths.length === 0;
  const rows = sortOwed(items);
  const monthRows = sortOwed(unpaidMonths);

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
        <OwedItemCard
          key={rowKey(item)}
          item={item}
          hideCustomerName
          onCollect={onCollect}
          onEdit={onEditItem}
          onVoid={onVoidItem}
          onWriteOff={onWriteOff}
          onRevertWriteOff={onRevertWriteOff}
          onOpen={onOpenItem}
          loading={openingItemKey === rowKey(item)}
        />
      ))}

      {unpaidMonths.length > 0 && (
        <>
          <SectionLabel className="mt-4 mb-2">{t("ledger.unpaid_months_section")}</SectionLabel>
          {monthRows.map((item) => (
            <OwedItemCard
              key={rowKey(item)}
              item={item}
              hideCustomerName
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
