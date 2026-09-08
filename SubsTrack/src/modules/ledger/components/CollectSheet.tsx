import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import {
  FormSheet,
  type SheetScrollTo,
} from "@/src/shared/components/FormSheet";
import { Button } from "@/src/shared/components/Button";
import { CurrencyInput } from "@/src/shared/components/CurrencyInput";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { Input } from "@/src/shared/components/Input";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import type { AllocationLine, OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { dayToInstantIso, getNowDateTimeString } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import {
  fundedPlans,
  groupKey,
  groupOwedByCurrency,
  planCollection,
  totalCollectingUsd,
} from "../utils/currencyGroups";
import { keyOf } from "../utils/waterfall";
import { CurrencyCollectSection } from "./CurrencyCollectSection";

export interface CollectGroupSubmit {
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  amount: number;
  lines: { item: OpenItem; amount: number }[];
}

interface Props {
  visible: boolean;
  onDismiss: () => void;
  customerName: string;
  owed: OpenItem[];
  loading: boolean;
  onSubmit: (args: {
    receivedAt: string;
    notes: string | null;
    groups: CollectGroupSubmit[];
  }) => void;
  singleItem?: OpenItem | null;
}

/**
 * The one door money comes in through.
 *
 * Two modes, one write shape: a WHOLE CUSTOMER (every currency owed listed at
 * once, each with its own amount box and oldest-first split) or a SINGLE BILL.
 *
 * A hand-over is single-currency (gotcha #108), so a mixed-currency customer
 * produces ONE `collections` row per currency — the amounts are typed in each
 * currency's own units and never converted, or the wallet would claim cash
 * nobody handed over and a balance would close a few piastres short. The total
 * in the display currency is shown for reading only.
 *
 * The split preview is the heart of it — staff sees exactly what the money will
 * do BEFORE saving. Any row can be unticked to steer the cash to the next one.
 */
export function CollectSheet({
  visible,
  onDismiss,
  customerName,
  owed,
  loading,
  onSubmit,
  singleItem = null,
}: Props) {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const displayCurrencyId = useDisplayCurrencyId();
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  useEffect(() => {
    if (visible) clearError();
  }, [visible, clearError]);

  const scrollBody = useRef<SheetScrollTo | null>(null);
  useEffect(() => {
    if (error) scrollBody.current?.(0);
  }, [error]);

  const openItem = singleItem?.openAmount ? singleItem : null;

  const groups = useMemo(
    () => (singleItem ? [] : groupOwedByCurrency(owed, currencies)),
    [singleItem, owed, currencies],
  );

  const [amounts, setAmounts] = useState<ReadonlyMap<string, number | null>>(
    () => new Map(groups.map((g) => [groupKey(g), g.owed])),
  );

  useEffect(() => {
    setAmounts((prev) => {
      const missing = groups.filter((g) => !prev.has(groupKey(g)));
      if (missing.length === 0) return prev;
      const next = new Map(prev);
      for (const group of missing) next.set(groupKey(group), group.owed);
      return next;
    });
  }, [groups]);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [receivedAt, setReceivedAt] = useState(getNowDateTimeString);
  const [notes, setNotes] = useState("");

  const [openBill, setOpenBill] = useState<number | null>(null);
  const [singleCurrencyId, setSingleCurrencyId] = useState<string | null>(
    () => singleItem?.currencyId ?? null,
  );
  const [singleAmount, setSingleAmount] = useState<number | null>(
    () => (singleItem && !singleItem.openAmount ? singleItem.balance : null),
  );

  const dirty = useDirtyForm({ amounts, singleAmount, openBill, receivedAt, notes });

  const display = findCurrency(currencies, displayCurrencyId);
  const singleCurrency = findCurrency(currencies, singleCurrencyId);

  const plans = useMemo(
    () => planCollection(groups, amounts, excluded),
    [groups, amounts, excluded],
  );
  const funded = useMemo(() => fundedPlans(plans), [plans]);
  const owedUsd = groups.reduce((sum, g) => sum + g.owedUsd, 0);
  const collectingUsd = totalCollectingUsd(plans);
  const overpaying = plans.some((p) => p.leftover > 0);

  const billedOpenItem = useMemo(
    () =>
      openItem
        ? {
            ...openItem,
            amount: openBill ?? 0,
            balance: openBill ?? 0,
            currencyId: singleCurrencyId,
            ratePerUsdSnapshot: singleCurrency?.ratePerUsd ?? 1,
          }
        : null,
    [openItem, openBill, singleCurrencyId, singleCurrency],
  );

  const singleTarget = billedOpenItem ?? singleItem;
  const singleMax = billedOpenItem ? (openBill ?? 0) : (singleItem?.balance ?? 0);
  const singleLines = useMemo<AllocationLine[]>(() => {
    if (!singleTarget) return [];
    const value = singleAmount ?? 0;
    if (value <= 0 || singleMax <= 0) return [];
    const take = Math.min(value, singleMax);
    return [{ item: singleTarget, amount: take, settles: take >= singleMax }];
  }, [singleTarget, singleAmount, singleMax]);
  const singleOverpaying = (singleAmount ?? 0) > singleMax;

  const money = (value: number) =>
    formatMoney(value, singleCurrency, singleCurrency);

  const canSubmit = singleItem
    ? !loading && singleLines.length > 0 && !singleOverpaying
    : !loading && funded.length > 0 && !overpaying;

  const submit = () => {
    if (!canSubmit) return;
    const groupsOut: CollectGroupSubmit[] = singleItem
      ? [
          {
            currencyId: singleCurrencyId,
            ratePerUsdSnapshot: singleCurrency?.ratePerUsd ?? 1,
            amount: singleLines.reduce((sum, l) => sum + l.amount, 0),
            lines: singleLines.map((l) => ({ item: l.item, amount: l.amount })),
          },
        ]
      : funded.map((p) => ({
          currencyId: p.currencyId,
          ratePerUsdSnapshot: p.ratePerUsd,
          amount: p.lines.reduce((sum, l) => sum + l.amount, 0),
          lines: p.lines.map((l) => ({ item: l.item, amount: l.amount })),
        }));

    onSubmit({
      receivedAt: dayToInstantIso(receivedAt),
      notes: notes.trim() || null,
      groups: groupsOut,
    });
  };

  const setAmount = (key: string, amount: number | null) =>
    setAmounts((prev) => new Map(prev).set(key, amount));

  const toggle = (item: OpenItem) => {
    const key = keyOf(item);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collectEverything = () =>
    setAmounts(new Map(groups.map((g) => [groupKey(g), g.owed])));

  return (
    <FormSheet
      visible={visible}
      onDismiss={onDismiss}
      dirty={dirty}
      scrollRef={scrollBody}
      title={
        singleItem
          ? t("ledger.collect_item_title", { item: singleItem.label })
          : t("ledger.collect_from", { name: customerName })
      }
    >
      <View className="gap-4 pb-8">
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {singleItem ? (
          <>
            {openItem ? (
              <Text className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {t("ledger.open_amount_hint")}
              </Text>
            ) : (
              <View className="flex-row items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <Text className="text-gray-600">{t("ledger.owed")}</Text>
                <View className="flex-row items-center gap-3">
                  <Text fontWeight="SemiBold" className="text-lg text-gray-900">
                    {money(singleMax)}
                  </Text>
                  <PressableOpacity
                    onPress={() => setSingleAmount(singleMax)}
                    className="rounded-lg bg-white px-3 py-1.5"
                  >
                    <Text fontWeight="Medium" className="text-xs text-primary">
                      {t("ledger.collect_all")}
                    </Text>
                  </PressableOpacity>
                </View>
              </View>
            )}

            {openItem && (
              <CurrencyInput
                label={t("ledger.month_amount")}
                amount={openBill}
                currencyId={singleCurrencyId}
                currencies={currencies}
                onChange={(next) => {
                  setOpenBill(next.amount);
                  setSingleCurrencyId(next.currencyId);
                  setSingleAmount(next.amount);
                }}
              />
            )}

            <CurrencyInput
              label={t("ledger.amount")}
              amount={singleAmount}
              currencyId={singleCurrencyId}
              currencies={currencies}
              lockCurrency
              onChange={(next) => setSingleAmount(next.amount)}
            />

            {(singleAmount ?? 0) > 0 && (singleAmount ?? 0) < singleMax && (
              <Text className="text-xs text-amber-700">
                {t("ledger.partial_leaves_debt")}
              </Text>
            )}

            {singleOverpaying && (
              <ErrorBanner
                message={t("ledger.cannot_exceed", { amount: money(singleMax) })}
                onDismiss={() => setSingleAmount(singleMax)}
              />
            )}
          </>
        ) : (
          <>
            <View className="gap-2 rounded-xl bg-gray-50 px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-600">{t("ledger.owed")}</Text>
                <View className="flex-row items-center gap-3">
                  <Text fontWeight="SemiBold" className="text-lg text-gray-900">
                    {formatMoney(owedUsd, null, display)}
                  </Text>
                  {groups.length > 1 && (
                    <PressableOpacity
                      onPress={collectEverything}
                      className="rounded-lg bg-white px-3 py-1.5"
                    >
                      <Text
                        fontWeight="Medium"
                        className="text-xs text-primary"
                      >
                        {t("ledger.collect_all")}
                      </Text>
                    </PressableOpacity>
                  )}
                </View>
              </View>
              {groups.length > 1 && (
                <Text className="text-xs text-gray-500">
                  {t("ledger.multi_currency_hint")}
                </Text>
              )}
            </View>

            {plans.map((plan) => (
              <CurrencyCollectSection
                key={groupKey(plan)}
                plan={plan}
                currencies={currencies}
                display={display}
                excluded={excluded}
                onChangeAmount={(amount) => setAmount(groupKey(plan), amount)}
                onToggle={toggle}
              />
            ))}

            <View className="flex-row items-center justify-between border-t border-gray-200 pt-3">
              <Text fontWeight="Bold" className="text-sm text-gray-900">
                {t("ledger.total_collecting")}
              </Text>
              <Text fontWeight="Bold" className="text-base text-gray-900">
                {formatMoney(collectingUsd, null, display)}
              </Text>
            </View>
          </>
        )}

        <DatePickerInput
          label={t("ledger.received_at")}
          value={receivedAt}
          onChange={setReceivedAt}
          showTime
        />

        <Input
          label={t("ledger.notes")}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <Button
          label={t("common.save")}
          onPress={submit}
          disabled={!canSubmit}
          loading={loading}
        />
      </View>
    </FormSheet>
  );
}
