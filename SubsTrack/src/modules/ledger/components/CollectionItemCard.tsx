import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { COLORS } from "@/src/shared/constants";
import type { CollectionItem } from "@/src/core/types";
import {
  findCurrency,
  formatMoney,
  snapshotCurrency,
} from "@/src/core/utils/currency";
import { formatDate, formatDateTime } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useLanguageStore } from "@/src/core/i18n/languageStore";
import { KIND_STYLE } from "../utils/kindStyle";

interface Props {
  item: CollectionItem;
  label: string;
  snapshot: { currencyId: string | null; ratePerUsdSnapshot: number };
  onOpen?: (item: CollectionItem) => void;
  loading?: boolean;
}

export function CollectionItemCard({
  item,
  label,
  snapshot,
  onOpen,
  loading,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const { language } = useLanguageStore();
  const locale = language === "ar" ? "ar" : "en-US";

  const source = snapshotCurrency(snapshot, currencies);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (v: number) => formatMoney(v, source, display);
  const charge = item.charge;
  const style = KIND_STYLE[charge?.kind ?? "manual"];

  return (
    <EntityCard
      icon={style.icon}
      iconColor={style.color}
      iconBgClassName={style.bgClassName}
      onPress={onOpen ? () => onOpen(item) : undefined}
    >
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-sm font-semibold text-slate-900"
            numberOfLines={2}
          >
            {label || t("ledger.payment")}
          </Text>
          <Text className="text-base font-semibold text-slate-900">
            {money(item.amount)}
          </Text>
        </View>

        {charge ? (
          <>
            <Text className="text-xs text-slate-600">
              {t("ledger.bill_total")} {money(charge.amount)} ·{" "}
              {t("ledger.due_on", { date: formatDate(charge.dueDate, locale) })}
            </Text>
            <Text className="text-[11px] text-slate-500">
              {t("ledger.issued_at")} {formatDateTime(charge.issuedAt, locale)}
            </Text>
          </>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator
          size="small"
          color={COLORS.gray600}
          className="ms-1 w-9"
        />
      ) : null}
    </EntityCard>
  );
}
