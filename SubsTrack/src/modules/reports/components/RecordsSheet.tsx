import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { Text } from "@/src/shared/components/Text";
import { EmptyState } from "@/src/shared/components/EmptyState";
import type { Currency } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { formatDate } from "@/src/core/utils/date";
import type { RecordRow } from "../utils/types";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  /** The figure that was tapped — the rows below must add up to it. */
  totalLabel: string;
  rows: RecordRow[];
  currencies: Currency[];
  displayCurrency: Currency | null;
}

/**
 * The drill-down: the records behind one number. Source-agnostic on purpose —
 * one sheet serves a month bar, a category row and a debtor alike, because a
 * caller hands it plain RecordRows filtered from data already in memory. No
 * report ever issues a second query to drill in.
 */
export function RecordsSheet({
  visible,
  onDismiss,
  title,
  totalLabel,
  rows,
  currencies,
  displayCurrency,
}: Props) {
  const { t } = useTranslation();

  return (
    <FormSheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      dismissLabel={t("common.close")}
    >
      <View className="pb-8">
        <View className="flex-row items-baseline gap-2 pb-3 border-b border-gray-100">
          <Text className="text-xs text-gray-400">{t("reports.total")}</Text>
          <Text fontWeight="Bold" className="text-lg text-gray-900">
            {totalLabel}
          </Text>
          <Text className="text-xs text-gray-400">
            {t("reports.record_count", { count: rows.length })}
          </Text>
        </View>

        {rows.length === 0 ? (
          <EmptyState message={t("reports.no_records")} />
        ) : (
          rows.map((row) => {
            // The row's OWN frozen rate, so the drill-down adds up to exactly
            // the figure that was tapped.
            const source = findCurrency(currencies, row.currencyId);
            const frozen = source ? { ...source, ratePerUsd: row.ratePerUsdSnapshot } : null;
            return (
              <View
                key={row.id}
                className="flex-row items-center gap-3 py-3 border-b border-gray-50"
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-gray-900" numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text className="text-xs text-gray-400" numberOfLines={1}>
                    {[formatDate(row.date), row.subtitle].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View className="items-end">
                  <Text fontWeight="Bold" className="text-sm text-gray-900">
                    {formatMoney(row.amount, frozen, frozen)}
                  </Text>
                  {row.currencyId ? (
                    <Text className="text-xs text-gray-400">
                      ≈ {formatMoney(row.amount, frozen, displayCurrency)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </FormSheet>
  );
}
