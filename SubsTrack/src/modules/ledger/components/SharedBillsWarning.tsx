import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { findCurrency, formatMoney, snapshotCurrency } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import type { SharedBill } from "../utils/sharedBills";

interface Props {
  /** The OTHER bills the hand-over settled. Renders nothing when empty. */
  bills: SharedBill[];
}

/**
 * The bills that get un-paid as collateral, named.
 *
 * A hand-over is always voided WHOLE (`collection_items` has no void of its
 * own), so undoing one month can un-pay a sale and another month that shared
 * the same cash. Prose alone read as boilerplate, so this names them.
 */
export function SharedBillsWarning({ bills }: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  if (bills.length === 0) return null;

  const display = findCurrency(currencies, displayCurrencyId);

  return (
    <View>
      <Text className="text-sm text-gray-600 mb-2">
        {t("ledger.shared_void_explainer", { count: bills.length })}
      </Text>

      <View className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        {bills.map((bill) => (
          <View
            key={`${bill.chargeId}|${bill.snapshot.currencyId ?? "USD"}`}
            className="flex-row items-center justify-between py-1"
          >
            <Text className="flex-1 text-sm text-gray-900 me-2" numberOfLines={1}>
              {bill.label}
            </Text>
            <Text fontWeight="SemiBold" className="text-sm text-danger">
              {/* Each row prints in ITS hand-over's currency — see SharedBill. */}
              {formatMoney(bill.amount, snapshotCurrency(bill.snapshot, currencies), display)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
