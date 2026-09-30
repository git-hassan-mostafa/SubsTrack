import { useEffect, useMemo, useState } from "react";
import type { Currency, OpenItem } from "@shared/core/types";
import { findCurrency, formatMoney } from "@shared/core/utils/currency";
import { getNowDateTimeString } from "@shared/core/utils/date";
import {
  poolGroups,
  receivedAtIso,
  singleCollectPlan,
  singleGroups,
  type CollectSubmission,
  type SingleCollectPlan,
} from "@shared/modules/ledger/utils/collectForm";
import {
  fundedPlans,
  groupKey,
  groupOwedByCurrency,
  planCollection,
  totalCollectingUsd,
  type CurrencyPlan,
} from "@shared/modules/ledger/utils/currencyGroups";
import { keyOf } from "@shared/modules/ledger/utils/waterfall";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@shared/state/hooks/useTenantSettingSlice";

export interface SingleCollectForm {
  item: OpenItem;
  openBill: number | null;
  currencyId: string | null;
  amount: number | null;
  plan: SingleCollectPlan;
  money: (value: number) => string;
  setOpenBill: (next: { amount: number | null; currencyId: string | null }) => void;
  setAmount: (amount: number | null) => void;
  collectAll: () => void;
}

export interface PoolCollectForm {
  plans: CurrencyPlan[];
  excluded: ReadonlySet<string>;
  multiCurrency: boolean;
  billCount: number;
  heroAmount: string;
  heroApprox: string | null;
  collectingText: string;
  funded: boolean;
  overpaying: boolean;
  setAmount: (key: string, amount: number | null) => void;
  toggle: (item: OpenItem) => void;
  collectEverything: () => void;
}

export interface CollectForm {
  single: SingleCollectForm | null;
  pool: PoolCollectForm;
  currencies: Currency[];
  display: Currency | null;
  receivedAt: string;
  pickReceivedAt: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  dirty: boolean;
  canSubmit: boolean;
  submission: () => CollectSubmission | null;
}

// The collect sheet's state; canSubmit is validity only, never the saving flag.
export function useCollectForm(owed: OpenItem[], singleItem: OpenItem | null): CollectForm {
  const currencies = useCurrencySlice((s) => s.items);
  const display = findCurrency(currencies, useDisplayCurrencyId());

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

  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [receivedAt, setReceivedAt] = useState(getNowDateTimeString);
  const [receivedAtPicked, setReceivedAtPicked] = useState(false);
  const [notes, setNotes] = useState("");
  const [openBill, setOpenBillValue] = useState<number | null>(null);
  const [singleCurrencyId, setSingleCurrencyId] = useState<string | null>(
    () => singleItem?.currencyId ?? null,
  );
  const [singleAmount, setSingleAmount] = useState<number | null>(() =>
    singleItem && !singleItem.openAmount ? singleItem.balance : null,
  );

  const dirty = useDirtyForm({ amounts, singleAmount, openBill, receivedAt, notes });

  const singleCurrency = findCurrency(currencies, singleCurrencyId);
  const singleRate = singleCurrency?.ratePerUsd ?? 1;
  const singlePlan = useMemo(
    () =>
      singleItem
        ? singleCollectPlan({
            item: singleItem,
            openBill,
            currencyId: singleCurrencyId,
            ratePerUsd: singleRate,
            amount: singleAmount,
          })
        : null,
    [singleItem, openBill, singleCurrencyId, singleRate, singleAmount],
  );

  const plans = useMemo(
    () => planCollection(groups, amounts, excluded),
    [groups, amounts, excluded],
  );
  const funded = useMemo(() => fundedPlans(plans), [plans]);
  const overpaying = plans.some((p) => p.leftover > 0);
  const multiCurrency = groups.length > 1;
  const owedUsd = groups.reduce((sum, g) => sum + g.owedUsd, 0);
  const soleCurrency = multiCurrency ? null : (groups[0]?.currency ?? null);

  const canSubmit = singlePlan
    ? singlePlan.lines.length > 0 && !singlePlan.overpaying
    : funded.length > 0 && !overpaying;

  const single: SingleCollectForm | null =
    singleItem && singlePlan
      ? {
          item: singleItem,
          openBill,
          currencyId: singleCurrencyId,
          amount: singleAmount,
          plan: singlePlan,
          money: (value) => formatMoney(value, singleCurrency, singleCurrency),
          setOpenBill: (next) => {
            setOpenBillValue(next.amount);
            setSingleCurrencyId(next.currencyId);
            setSingleAmount(next.amount);
          },
          setAmount: setSingleAmount,
          collectAll: () => setSingleAmount(singlePlan.max),
        }
      : null;

  const pool: PoolCollectForm = {
    plans,
    excluded,
    multiCurrency,
    billCount: owed.length,
    heroAmount: multiCurrency
      ? formatMoney(owedUsd, null, display)
      : formatMoney(groups[0]?.owed ?? 0, soleCurrency, soleCurrency),
    heroApprox:
      !multiCurrency && (soleCurrency?.id ?? null) !== (display?.id ?? null)
        ? `≈ ${formatMoney(owedUsd, null, display)}`
        : null,
    collectingText: formatMoney(totalCollectingUsd(plans), null, display),
    funded: funded.length > 0,
    overpaying,
    setAmount: (key, amount) => setAmounts((prev) => new Map(prev).set(key, amount)),
    toggle: (item) => {
      const key = keyOf(item);
      setExcluded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    collectEverything: () => setAmounts(new Map(groups.map((g) => [groupKey(g), g.owed]))),
  };

  return {
    single,
    pool,
    currencies,
    display,
    receivedAt,
    pickReceivedAt: (value) => {
      if (value === receivedAt) return;
      setReceivedAt(value);
      setReceivedAtPicked(true);
    },
    notes,
    setNotes,
    dirty,
    canSubmit,
    submission: () => {
      if (!canSubmit) return null;
      return {
        receivedAt: receivedAtIso(receivedAt, receivedAtPicked),
        notes: notes.trim() || null,
        groups: singlePlan ? singleGroups(singlePlan, singleCurrencyId, singleRate) : poolGroups(funded),
      };
    },
  };
}
