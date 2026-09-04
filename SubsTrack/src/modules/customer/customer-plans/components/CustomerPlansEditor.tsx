import { Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@/src/core/types";
import type {
  LineDraft,
  RemovedLine,
} from "@/src/modules/customer/customer-plans";
import { PlanLineCard, type PlanRow } from "./PlanLineCard";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { getTodayDateString } from "@/src/core/utils/date";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useCustomerPlanSlice } from "@/src/state/hooks/useCustomerPlanSlice";
import { confirm } from "@/src/shared/lib/confirm";
import { RemovePlanChoice } from "./RemovePlanChoice";
import { PlanFormSheet } from "@/src/modules/admin/plans";

// What the parent form reads back on submit. `lines` = the active rows as
// drafts (created / kept / updated). `removed` = existing active lines the user
// deleted this session (each with whether it's a permanent hard delete).
// `reactivated` = cancelled line ids the user brought back to active.
export interface CustomerPlansEditorHandle {
  getLines: () => LineDraft[];
  getRemoved: () => RemovedLine[];
  getReactivated: () => string[];
}

// Row keys only need to be unique within one editor, so the suffix is handed in
// by the caller. Pure on purpose: the previous version read a ref counter, which
// also ran in the `useState` initializer (i.e. during render) and made React
// Compiler skip optimizing this whole component.
function makeRow(suffix: number, date: string): PlanRow {
  return {
    key: `new-${suffix}`,
    planId: null,
    startDate: date,
    customPrice: null,
    customCurrencyId: null,
    status: "active",
  };
}

interface Props {
  customer?: Customer | null;
  branchId: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  ref: Ref<CustomerPlansEditorHandle>;
}

// Inline Plans (service lines) editor. Owns the row state for a customer's
// service lines — add / change / remove / reactivate inline. A customer always
// keeps at least one active line; a plan-less line records custom amounts only.
// Cancelled lines stay visible (read-only) so their history is reachable and
// they can be reactivated. The parent form drives submit and reads the drafts
// through the imperative ref handle.
export function CustomerPlansEditor({
  customer,
  branchId,
  onDirtyChange,
  ref,
}: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const currencies = useCurrencySlice((s) => s.items);
  const hasPayments = useCustomerPlanSlice((s) => s.hasPayments);
  const getPaidLineIds = useCustomerPlanSlice((s) => s.getPaidLineIds);

  const rowKey = useRef(0);

  const [rows, setRows] = useState<PlanRow[]>(() => {
    const lines = customer?.customerPlans ?? [];
    if (lines.length > 0) {
      return lines.map((l) => ({
        key: l.id,
        id: l.id,
        planId: l.planId,
        startDate: l.startDate,
        customPrice: l.customPrice,
        customCurrencyId: l.customCurrencyId,
        status: l.active ? ("active" as const) : ("cancelled" as const),
      }));
    }
    return [makeRow(0, getTodayDateString())];
  });
  const [removed, setRemoved] = useState<RemovedLine[]>([]);
  const [reactivated, setReactivated] = useState<string[]>([]);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [lockedLineIds, setLockedLineIds] = useState<string[]>([]);

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

  const [initialRows] = useState(() => rows);
  const [autoCleared, setAutoCleared] = useState<string[]>([]);

  const plansDirty =
    removed.length > 0 ||
    reactivated.length > 0 ||
    rows.length !== initialRows.length ||
    rows.some((r, i) => {
      const base = initialRows[i];
      return (
        !base ||
        base.key !== r.key ||
        (base.planId !== r.planId && !autoCleared.includes(r.key)) ||
        base.startDate !== r.startDate ||
        base.customPrice !== r.customPrice ||
        (r.customPrice !== null && base.customCurrencyId !== r.customCurrencyId) ||
        base.status !== r.status
      );
    });

  useEffect(() => {
    onDirtyChange?.(plansDirty);
  }, [plansDirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    getLines: () =>
      rows
        .filter((r) => r.status === "active")
        .map((r) => {
          const keep = r.customPrice !== null && r.customPrice > 0;
          return {
            id: r.id,
            planId: r.planId,
            startDate: r.startDate,
            customPrice: keep ? r.customPrice : null,
            customCurrencyId: keep ? r.customCurrencyId : null,
          };
        }),
    getRemoved: () => removed,
    getReactivated: () => reactivated,
  }));

  useEffect(() => {
    const cleared: string[] = [];
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.status !== "active" || !r.planId) return r;
        const p = plans.find((pl) => pl.id === r.planId);
        if (p && p.branchId !== null && p.branchId !== branchId) {
          changed = true;
          cleared.push(r.key);
          return { ...r, planId: null };
        }
        return r;
      });
      return changed ? next : prev;
    });
    if (cleared.length > 0) {
      setAutoCleared((prev) => [...new Set([...prev, ...cleared])]);
    }
  }, [branchId, plans]);

  function setRowPlan(key: string, planId: string | null) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, planId } : r)),
    );
    setAutoCleared((prev) => prev.filter((k) => k !== key));
  }

  function setRowPrice(
    key: string,
    customPrice: number | null,
    customCurrencyId: string | null,
  ) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, customPrice, customCurrencyId } : r,
      ),
    );
  }

  function setRowStartDate(key: string, date: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, startDate: date } : r)),
    );
  }

  // A new line inherits the last row's start date — the common case is a second
  // service beginning alongside the first — falling back to today.
  function addRow() {
    rowKey.current += 1;
    setRows((prev) => [
      ...prev,
      makeRow(
        rowKey.current,
        prev[prev.length - 1]?.startDate ?? getTodayDateString(),
      ),
    ]);
  }

  const activeCount = rows.filter((r) => r.status === "active").length;

  // Removes an active row. A new (unsaved) row just drops. A saved line with
  // payments opens the confirm dialog whose choice (keep months vs delete
  // permanently) rides on a ref; "keep" soft-cancels (row stays as cancelled),
  // "delete" hard-deletes (row drops). A saved line with no payments hard-deletes.
  async function removeRow(key: string) {
    if (activeCount <= 1) return;
    const target = rows.find((r) => r.key === key);
    if (!target || target.status !== "active") return;

    if (!target.id) {
      setRows((prev) => prev.filter((r) => r.key !== key));
      return;
    }

    const id = target.id;
    const paid = await hasPayments(id);
    if (paid) {
      const hardRef = { current: false };
      const ok = await confirm({
        title: t("subscriptions.remove_plan_title"),
        message: t("subscriptions.remove_plan_paid_message"),
        confirmLabel: t("subscriptions.remove_plan"),
        destructive: true,
        content: () => (
          <RemovePlanChoice onChange={(v) => (hardRef.current = v)} />
        ),
      });
      if (!ok) return;
      const hardDelete = hardRef.current;
      setRemoved((prev) => [...prev, { id, hardDelete }]);
      if (hardDelete) {
        setRows((prev) => prev.filter((r) => r.key !== key));
      } else {
        setRows((prev) =>
          prev.map((r) => (r.key === key ? { ...r, status: "cancelled" } : r)),
        );
      }
    } else {
      setRemoved((prev) => [...prev, { id, hardDelete: true }]);
      setRows((prev) => prev.filter((r) => r.key !== key));
    }
  }

  // Brings a cancelled row back to active. If it was soft-cancelled in THIS
  // session (still in `removed`), the two cancel out — just undo the removal.
  // Otherwise it was cancelled in a past session, so schedule a reactivation.
  function reactivateRow(key: string) {
    const target = rows.find((r) => r.key === key);
    if (!target || !target.id) return;
    const id = target.id;
    const wasRemovedThisSession = removed.some((r) => r.id === id);
    if (wasRemovedThisSession) {
      setRemoved((prev) => prev.filter((r) => r.id !== id));
    } else {
      setReactivated((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, status: "active" } : r)),
    );
  }

  const multiple = rows.length > 1;

  return (
    <View className="mt-2 mb-2 border-t border-gray-100 pt-3">
      {/* Section header — one line. The subtitle only matters once a customer
          actually holds more than one line, so it waits until then. */}
      <View className="flex-row items-center mb-2">
        <Ionicons name="layers-outline" size={16} color={COLORS.gray500} />
        <Text fontWeight="SemiBold" className="ms-2 flex-1 text-sm text-gray-900">
          {t("subscriptions.section_title")}
        </Text>
        {multiple ? (
          <Text className="text-xs text-gray-400">
            {t("subscriptions.section_subtitle")}
          </Text>
        ) : null}
      </View>

      {/* Line cards */}
      {rows.map((row, i) => (
        <PlanLineCard
          key={row.key}
          row={row}
          index={i}
          plan={plans.find((p) => p.id === row.planId) ?? null}
          branchId={branchId}
          currencies={currencies}
          dateLocked={row.id != null && lockedLineIds.includes(row.id)}
          showHeader={multiple}
          canRemove={activeCount > 1}
          onPlanChange={(v) => setRowPlan(row.key, v)}
          onStartDateChange={(v) => setRowStartDate(row.key, v)}
          onPriceChange={(amount, currencyId) =>
            setRowPrice(row.key, amount, currencyId)
          }
          onRemove={() => void removeRow(row.key)}
          onReactivate={() => reactivateRow(row.key)}
          onAddPlan={() => setAddPlanOpen(true)}
        />
      ))}

      {/* Add line — dashed affordance */}
      <PressableOpacity
        onPress={addRow}
        className="flex-row items-center justify-center rounded-xl border border-dashed border-gray-300 py-2"
      >
        <Ionicons name="add" size={16} color={COLORS.primary} />
        <Text className="text-primary text-xs font-semibold ms-1">
          {t("subscriptions.add_plan")}
        </Text>
      </PressableOpacity>

      {addPlanOpen && <PlanFormSheet onDismiss={() => setAddPlanOpen(false)} />}
    </View>
  );
}
