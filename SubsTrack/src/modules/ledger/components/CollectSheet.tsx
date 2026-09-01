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
import { Dropdown } from "@/src/shared/components/Dropdown";
import { useDirtyForm } from "@/src/shared/hooks/useDirtyForm";
import type { OpenItem } from "@/src/core/types";
import { findCurrency, formatMoney } from "@/src/core/utils/currency";
import { dayToInstantIso, getNowDateTimeString } from "@/src/core/utils/date";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@/src/state/hooks/useLedgerSlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { allocate, keyOf, sortByDue, totalOwed } from "../utils/waterfall";
import { AllocationPreview } from "./AllocationPreview";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  customerName: string;
  /** Everything the customer owes — debts AND plain unpaid months. */
  owed: OpenItem[];
  loading: boolean;
  onSubmit: (args: {
    amount: number;
    currencyId: string | null;
    ratePerUsdSnapshot: number;
    receivedAt: string;
    notes: string | null;
    lines: { item: OpenItem; amount: number }[];
  }) => void;
  /** Single-item mode: only this bill is collectable, no split preview. */
  singleItem?: OpenItem | null;
}

/**
 * The one door money comes in through.
 *
 * Two modes, one write: a WHOLE CUSTOMER (type an amount, the waterfall splits
 * it oldest-first across everything owed) or a SINGLE BILL. Both produce the
 * same rows, so there is one code path and one audit shape.
 *
 * The split preview is the heart of it — staff sees exactly what the money will
 * do BEFORE saving, which is what makes an automatic allocation trustworthy
 * instead of magic. Any row can be unticked to steer the cash to the next one.
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
  // A failed save belongs HERE, next to the button that caused it — not on
  // whichever screen behind the sheet happens to render the slice's banner.
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  // A failure from a previous attempt must not greet the next open.
  useEffect(() => {
    if (visible) clearError();
  }, [visible, clearError]);

  // Save sits at the bottom and the banner at the top, so on a long split
  // preview a failed save would otherwise be announced off-screen.
  const scrollBody = useRef<SheetScrollTo | null>(null);
  useEffect(() => {
    if (error) scrollBody.current?.(0);
  }, [error]);

  const pool = useMemo(
    () => (singleItem ? [singleItem] : owed),
    [singleItem, owed],
  );

  // A month on a line with no set price: nothing is owed yet, so there is no
  // ceiling, no split and no locked currency — what is typed becomes the bill.
  const openItem = singleItem?.openAmount ? singleItem : null;

  // A hand-over is ONE currency, and it must match the bills it pays — that is
  // what lets a balance close at exactly zero. When a customer owes in two
  // currencies he is collected from twice, so the picker only appears then.
  const currencyIds = useMemo(
    () => Array.from(new Set(pool.map((i) => i.currencyId))),
    [pool],
  );
  const [currencyId, setCurrencyId] = useState<string | null>(() =>
    dominantCurrency(pool),
  );
  // Open mode only: what this month costs. Typing it is what raises the bill.
  const [openBill, setOpenBill] = useState<number | null>(null);
  // Sorted HERE, not trusted from the caller: the preview must be drawn in the
  // very order allocate() fills the bills, or the rows say one thing and the
  // money does another (the debts screen hands over two lists glued together).
  const scoped = useMemo(
    () => sortByDue(pool.filter((i) => i.currencyId === currencyId)),
    [pool, currencyId],
  );

  const maxAmount = useMemo(
    () => (openItem ? (openBill ?? 0) : totalOwed(scoped)),
    [openItem, openBill, scoped],
  );
  const [amount, setAmount] = useState<number | null>(() => maxAmount || null);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [receivedAt, setReceivedAt] = useState(getNowDateTimeString);
  const [notes, setNotes] = useState("");

  const dirty = useDirtyForm({ amount, openBill, receivedAt, notes });

  const currency = findCurrency(currencies, currencyId);
  const display = findCurrency(currencies, displayCurrencyId);
  const money = (value: number) => formatMoney(value, currency, display);

  // The typed month amount turns the open item into an ordinary bill, so
  // partial collection, the "leaves owing" hint and the overpay refusal below
  // all work exactly as they do for a priced line.
  const billedOpenItem = useMemo(
    () =>
      openItem
        ? {
            ...openItem,
            amount: openBill ?? 0,
            balance: openBill ?? 0,
            currencyId,
            ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
          }
        : null,
    [openItem, openBill, currencyId, currency],
  );

  const included = useMemo(
    () => scoped.filter((i) => !excluded.has(keyOf(i))),
    [scoped, excluded],
  );
  const { lines, leftover } = useMemo(() => {
    // One line, no split: the month amount is its ceiling.
    if (billedOpenItem) {
      const value = amount ?? 0;
      const bill = billedOpenItem.balance;
      if (value <= 0 || bill <= 0) return { lines: [], leftover: 0 };
      return {
        lines: [
          {
            item: billedOpenItem,
            amount: Math.min(value, bill),
            settles: value >= bill,
          },
        ],
        leftover: Math.max(0, value - bill),
      };
    }
    return allocate(amount ?? 0, included);
  }, [billedOpenItem, amount, included]);

  const remainingAfter = maxAmount - (amount ?? 0);
  // Overpay is refused: there is nowhere for unapplied cash to live.
  const overpaying = leftover > 0;
  const canSubmit =
    !loading && (amount ?? 0) > 0 && lines.length > 0 && !overpaying;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      amount: amount!,
      currencyId,
      ratePerUsdSnapshot: currency?.ratePerUsd ?? 1,
      receivedAt: dayToInstantIso(receivedAt),
      notes: notes.trim() || null,
      lines: lines.map((l) => ({ item: l.item, amount: l.amount })),
    });
  };

  const toggle = (item: OpenItem) => {
    const key = keyOf(item);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
      <View className="gap-4 px-4 pb-8">
        {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

        {/* What is owed, and the one tap that collects all of it. Not for an
            open month: there is no figure yet, the amount typed becomes it. */}
        {openItem ? (
          <Text className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {t("ledger.open_amount_hint")}
          </Text>
        ) : (
          <View className="flex-row items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <Text className="text-slate-600">{t("ledger.owed")}</Text>
            <View className="flex-row items-center gap-3">
              <Text className="text-lg font-semibold text-slate-900">
                {money(maxAmount)}
              </Text>
              <PressableOpacity
                onPress={() => setAmount(maxAmount)}
                className="rounded-lg bg-white px-3 py-1.5"
              >
                <Text className="text-xs font-medium text-primary">
                  {t("ledger.collect_all")}
                </Text>
              </PressableOpacity>
            </View>
          </View>
        )}

        {/* What this month costs. It is the bill, so it also decides the
            currency and the ceiling on what can be collected. */}
        {openItem && (
          <CurrencyInput
            label={t("ledger.month_amount")}
            amount={openBill}
            currencyId={currencyId}
            currencies={currencies}
            onChange={(next) => {
              setOpenBill(next.amount);
              setCurrencyId(next.currencyId);
              // Paid in full is the norm; staff lower it for a part payment.
              setAmount(next.amount);
            }}
          />
        )}

        {currencyIds.length > 1 && !openItem && (
          <View className="gap-1">
            <Dropdown
              label={t("ledger.currency")}
              value={currencyId ?? ""}
              onChange={(next) => {
                setCurrencyId(next || null);
                setExcluded(new Set());
                setAmount(null);
              }}
              options={currencyIds.map((id) => ({
                value: id ?? "",
                label: findCurrency(currencies, id)?.code ?? "USD",
              }))}
            />
            <Text className="text-xs text-amber-700">
              {t("ledger.other_currency_hint")}
            </Text>
          </View>
        )}

        <CurrencyInput
          label={t("ledger.amount")}
          amount={amount}
          currencyId={currencyId}
          currencies={currencies}
          // The currency is decided by the bills being paid, never typed here —
          // a hand-over must match what it settles. In open mode the month
          // amount above is that bill, so the currency follows it.
          lockCurrency
          onChange={(next) => setAmount(next.amount)}
        />

        <DatePickerInput
          label={t("ledger.received_at")}
          value={receivedAt}
          onChange={setReceivedAt}
          showTime
        />

        {!singleItem && (
          <AllocationPreview
            items={scoped}
            lines={lines}
            excluded={excluded}
            onToggle={toggle}
            money={money}
            remainingAfter={remainingAfter}
          />
        )}

        {singleItem && (amount ?? 0) > 0 && (amount ?? 0) < maxAmount && (
          <Text className="text-xs text-amber-700">
            {t("ledger.partial_leaves_debt")}
          </Text>
        )}

        {overpaying && (
          <ErrorBanner
            message={t("ledger.cannot_exceed", { amount: money(maxAmount) })}
            onDismiss={() => setAmount(maxAmount)}
          />
        )}

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

/** The currency the customer owes the most in — the sensible default. */
function dominantCurrency(items: OpenItem[]): string | null {
  const byCurrency = new Map<string | null, number>();
  for (const i of items) {
    byCurrency.set(
      i.currencyId,
      (byCurrency.get(i.currencyId) ?? 0) + i.balance / i.ratePerUsdSnapshot,
    );
  }
  let best: string | null = null;
  let bestUsd = -1;
  for (const [id, usd] of byCurrency) {
    if (usd > bestUsd) {
      best = id;
      bestUsd = usd;
    }
  }
  return best;
}
