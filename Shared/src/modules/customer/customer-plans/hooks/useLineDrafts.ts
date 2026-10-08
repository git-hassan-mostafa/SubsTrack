import { useEffect, useRef, useState, type ReactNode } from "react";
import i18n from "@shared/core/i18n";
import type { Customer } from "@shared/core/types";
import { getTodayDateString } from "@shared/core/utils/date";
import type {
  LineDraft,
  RemovedLine,
} from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import {
  clearOtherBranchPlans,
  lineRowsChanged,
  newLineRow,
  nextLineStartDate,
  rowPriceChanged,
  rowsFromCustomer,
  toLineDrafts,
  type LineRow,
} from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { confirm } from "@shared/shared/lib/confirm";
import { useCustomerPlanSlice } from "@shared/state/hooks/useCustomerPlanSlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

export type HardDeleteChoice = (onChange: (hardDelete: boolean) => void) => ReactNode;

interface LineDraftsOptions {
  customer: Customer | null | undefined;
  branchId: string | null;
  hardDeleteChoice: HardDeleteChoice;
}

export interface LineDraftsResult {
  lines: LineDraft[];
  removed: RemovedLine[];
  reactivated: string[];
}

export interface LineDrafts {
  rows: LineRow[];
  activeCount: number;
  removingKey: string | null;
  dirty: boolean;
  isDateLocked: (row: LineRow) => boolean;
  setPlan: (key: string, planId: string | null) => void;
  setPrice: (key: string, amount: number | null, currencyId: string | null) => void;
  setStartDate: (key: string, date: string) => void;
  priceChanged: (row: LineRow) => boolean;
  setPriceFrom: (key: string, month: string) => void;
  addRow: () => void;
  removeRow: (key: string) => Promise<void>;
  reactivateRow: (key: string) => void;
  result: () => LineDraftsResult;
}

// A customer keeps at least one active line; only a PAID saved line asks first.
export function useLineDrafts({
  customer,
  branchId,
  hardDeleteChoice,
}: LineDraftsOptions): LineDrafts {
  const plans = usePlanSlice((s) => s.items);
  const hasPayments = useCustomerPlanSlice((s) => s.hasPayments);
  const getPaidLineIds = useCustomerPlanSlice((s) => s.getPaidLineIds);
  const rowKey = useRef(0);
  const [rows, setRows] = useState<LineRow[]>(() =>
    rowsFromCustomer(customer, getTodayDateString()),
  );
  const [initialRows] = useState(() => rows);
  const [removed, setRemoved] = useState<RemovedLine[]>([]);
  const [reactivated, setReactivated] = useState<string[]>([]);
  const [lockedLineIds, setLockedLineIds] = useState<string[]>([]);
  const [autoCleared, setAutoCleared] = useState<string[]>([]);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const customerId = customer?.id;
  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    void getPaidLineIds(customerId).then((ids) => {
      if (alive) setLockedLineIds(ids);
    });
    return () => {
      alive = false;
    };
  }, [customerId, getPaidLineIds]);

  const [checkedScope, setCheckedScope] = useState<{
    branchId: string | null;
    plans: typeof plans;
  } | null>(null);
  if (
    !checkedScope ||
    checkedScope.branchId !== branchId ||
    checkedScope.plans !== plans
  ) {
    setCheckedScope({ branchId, plans });
    const next = clearOtherBranchPlans(rows, plans, branchId);
    if (next.cleared.length > 0) {
      setRows(next.rows);
      setAutoCleared((prev) => [...new Set([...prev, ...next.cleared])]);
    }
  }

  const patchRow = (key: string, patch: Partial<LineRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const activeCount = rows.filter((row) => row.status === "active").length;

  const askHardDelete = async (): Promise<boolean | null> => {
    const choice = { hardDelete: false };
    const ok = await confirm({
      title: i18n.t("subscriptions.remove_plan_title"),
      message: i18n.t("subscriptions.remove_plan_paid_message"),
      confirmLabel: i18n.t("subscriptions.remove_plan"),
      destructive: true,
      content: () =>
        hardDeleteChoice((hardDelete) => {
          choice.hardDelete = hardDelete;
        }),
    });
    return ok ? choice.hardDelete : null;
  };

  const removeRow = async (key: string) => {
    if (activeCount <= 1 || removingKey) return;
    const target = rows.find((row) => row.key === key);
    if (!target || target.status !== "active") return;
    if (!target.id) {
      setRows((prev) => prev.filter((row) => row.key !== key));
      return;
    }
    const id = target.id;
    setRemovingKey(key);
    let paid: boolean;
    try {
      paid = await hasPayments(id);
    } finally {
      setRemovingKey(null);
    }
    const hardDelete = paid ? await askHardDelete() : true;
    if (hardDelete === null) return;
    setRemoved((prev) => [...prev, { id, hardDelete }]);
    if (hardDelete) setRows((prev) => prev.filter((row) => row.key !== key));
    else patchRow(key, { status: "cancelled" });
  };

  const reactivateRow = (key: string) => {
    const id = rows.find((row) => row.key === key)?.id;
    if (!id) return;
    if (removed.some((r) => r.id === id)) {
      setRemoved((prev) => prev.filter((r) => r.id !== id));
    } else {
      setReactivated((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    patchRow(key, { status: "active" });
  };

  return {
    rows,
    activeCount,
    removingKey,
    dirty:
      removed.length > 0 ||
      reactivated.length > 0 ||
      lineRowsChanged(initialRows, rows, autoCleared),
    isDateLocked: (row) => row.id != null && lockedLineIds.includes(row.id),
    setPlan: (key, planId) => {
      patchRow(key, { planId });
      setAutoCleared((prev) => prev.filter((k) => k !== key));
    },
    setPrice: (key, customPrice, customCurrencyId) =>
      patchRow(key, { customPrice, customCurrencyId }),
    setStartDate: (key, startDate) => patchRow(key, { startDate }),
    priceChanged: (row) => rowPriceChanged(initialRows, row),
    setPriceFrom: (key, priceFrom) => patchRow(key, { priceFrom }),
    addRow: () => {
      rowKey.current += 1;
      const suffix = rowKey.current;
      setRows((prev) => [
        ...prev,
        newLineRow(suffix, nextLineStartDate(prev, getTodayDateString())),
      ]);
    },
    removeRow,
    reactivateRow,
    result: () => ({ lines: toLineDrafts(rows), removed, reactivated }),
  };
}
