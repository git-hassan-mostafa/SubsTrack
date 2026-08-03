import { Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { DatePickerInput } from "@/src/shared/components/DatePickerInput";
import { PlanPicker } from "@/src/shared/components/PlanPicker";
import { COLORS } from "@/src/shared/constants";
import type { Customer } from "@/src/core/types";
import type { LineDraft, RemovedLine } from "@/src/modules/customer/customer-plans";
import { getTodayDateString } from "@/src/core/utils/date";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { useCustomerPlanSlice } from "@/src/state/hooks/useCustomerPlanSlice";
import { confirm } from "@/src/shared/lib/confirm";
import { RemovePlanChoice } from "./RemovePlanChoice";
import { PlanFormSheet } from "@/src/modules/admin/plans";

// One row in the inline Plans editor. `id` present = an existing line being
// kept/edited; absent = a new line to create. `status` "cancelled" = a
// soft-cancelled line, shown read-only with a Reactivate action.
type PlanRow = {
  key: string;
  id?: string;
  planId: string | null;
  startDate: string;
  status: "active" | "cancelled";
};

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
    status: "active",
  };
}

interface Props {
  customer?: Customer | null;
  // The customer's currently-selected branch. Scopes the PlanPicker and drops
  // any row plan that no longer belongs to the branch when it changes.
  branchId: string | null;
  // The customer's start date — new lines inherit it.
  startDate: string;
  // Reports whether the user has touched the plan rows, so the parent form can
  // include them in its unsaved-changes check (the rows live here, not in the
  // parent's form state, so a state diff up there would miss them).
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
  startDate,
  onDirtyChange,
  ref,
}: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);
  const hasPayments = useCustomerPlanSlice((s) => s.hasPayments);

  // Suffix of the last row added in this session. Only ever touched from an event
  // handler — never during render.
  const rowKey = useRef(0);

  // Existing customer → one row per line (active + cancelled, so cancelled ones
  // stay visible); new customer → one empty active row.
  const [rows, setRows] = useState<PlanRow[]>(() => {
    const lines = customer?.customerPlans ?? [];
    if (lines.length > 0) {
      return lines.map((l) => ({
        key: l.id,
        id: l.id,
        planId: l.planId,
        startDate: l.startDate,
        status: l.active ? ("active" as const) : ("cancelled" as const),
      }));
    }
    return [makeRow(0, customer?.startDate ?? getTodayDateString())];
  });
  const [removed, setRemoved] = useState<RemovedLine[]>([]);
  const [reactivated, setReactivated] = useState<string[]>([]);
  const [addPlanOpen, setAddPlanOpen] = useState(false);

  // Baseline for the dirty check — the rows as first built, captured in a lazy
  // initializer (never read a ref during render: gotcha #52).
  const [initialRows] = useState(() => rows);
  // Rows whose plan the branch-reconciliation effect below cleared on its own.
  // That is not a user edit, so their planId is excluded from the dirty compare —
  // otherwise merely opening an existing customer whose line points at an
  // out-of-branch plan raised the discard prompt once `plans` finished loading.
  const [autoCleared, setAutoCleared] = useState<string[]>([]);

  // A removal/reactivation is a change by definition; otherwise compare the rows
  // field-by-field. Reported upward so the parent's discard prompt covers plans.
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
        base.status !== r.status
      );
    });

  useEffect(() => {
    onDirtyChange?.(plansDirty);
  }, [plansDirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    // Only active rows become create/update drafts; cancelled rows are excluded.
    getLines: () =>
      rows
        .filter((r) => r.status === "active")
        .map((r) => ({ id: r.id, planId: r.planId, startDate: r.startDate })),
    getRemoved: () => removed,
    getReactivated: () => reactivated,
  }));

  // When the branch changes, drop any selected plan that's branch-specific to a
  // different branch (shared plans — branchId null — stay valid everywhere).
  // Cancelled rows are read-only, so leave them untouched.
  //
  // Returns `prev` untouched when nothing was dropped so React can bail out.
  // `prev.map()` always allocates a new array, which made this effect force a
  // second render of the whole customer form on every single open.
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
    // Remember which rows WE cleared so the dirty check doesn't read it as an edit.
    if (cleared.length > 0) {
      setAutoCleared((prev) => [...new Set([...prev, ...cleared])]);
    }
  }, [branchId, plans]);

  function setRowPlan(key: string, planId: string | null) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, planId } : r)));
    // A deliberate pick overrides the auto-clear, so this row counts as edited again.
    setAutoCleared((prev) => prev.filter((k) => k !== key));
  }

  function setRowStartDate(key: string, date: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, startDate: date } : r)),
    );
  }

  function addRow() {
    rowKey.current += 1;
    setRows((prev) => [...prev, makeRow(rowKey.current, startDate)]);
  }

  const activeCount = rows.filter((r) => r.status === "active").length;

  // Removes an active row. A new (unsaved) row just drops. A saved line with
  // payments opens the confirm dialog whose choice (keep months vs delete
  // permanently) rides on a ref; "keep" soft-cancels (row stays as cancelled),
  // "delete" hard-deletes (row drops). A saved line with no payments hard-deletes.
  async function removeRow(key: string) {
    if (activeCount <= 1) return; // keep at least one active line
    const target = rows.find((r) => r.key === key);
    if (!target || target.status !== "active") return;

    // New (unsaved) row → just drop it; nothing recorded server-side yet.
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
      if (!ok) return; // user backed out — keep the plan active
      const hardDelete = hardRef.current;
      setRemoved((prev) => [...prev, { id, hardDelete }]);
      if (hardDelete) {
        // Permanent delete → the row disappears.
        setRows((prev) => prev.filter((r) => r.key !== key));
      } else {
        // Soft-cancel → the row stays, shown as cancelled.
        setRows((prev) =>
          prev.map((r) =>
            r.key === key ? { ...r, status: "cancelled" } : r,
          ),
        );
      }
    } else {
      // No payments → hard-delete on save; the row disappears.
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
    <View className="mt-2 mb-2 border-t border-gray-100 pt-4">
      {/* Section header */}
      <View className="flex-row items-center mb-3">
        <Ionicons name="layers-outline" size={18} color={COLORS.gray500} />
        <View className="ms-2 flex-1">
          <Text fontWeight="SemiBold" className="text-base text-gray-900">
            {t("subscriptions.section_title")}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t("subscriptions.section_subtitle")}
          </Text>
        </View>
        {multiple ? (
          <View className="rounded-full bg-gray-100 px-2.5 py-1">
            <Text fontWeight="SemiBold" className="text-xs text-gray-500">
              {rows.length}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Line cards */}
      {rows.map((row, i) => {
        const cancelled = row.status === "cancelled";
        return (
          <View
            key={row.key}
            className={`rounded-2xl border px-3.5 pt-4 mb-3 ${
              cancelled
                ? "border-gray-200 bg-gray-100 opacity-70"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            {/* Card header — line number + remove/reactivate. Hidden when there's
                a single line so the common case stays uncluttered. */}
            {multiple ? (
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center">
                  <View className="w-6 h-6 rounded-full bg-indigo-50 items-center justify-center">
                    <Text fontWeight="Bold" className="text-xs text-primary">
                      {i + 1}
                    </Text>
                  </View>
                  <Text
                    fontWeight="SemiBold"
                    className="ms-2 text-sm text-gray-700"
                  >
                    {t("subscriptions.line_label", { number: i + 1 })}
                  </Text>
                  {cancelled ? (
                    <View className="ms-2 rounded-full bg-gray-200 px-2 py-0.5">
                      <Text
                        fontWeight="SemiBold"
                        className="text-[10px] text-gray-500"
                      >
                        {t("subscriptions.cancelled_badge")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {cancelled ? (
                  <PressableOpacity
                    onPress={() => reactivateRow(row.key)}
                    accessibilityLabel={t("subscriptions.reactivate_plan")}
                    hitSlop={8}
                    className="flex-row items-center px-2 py-1 -me-1"
                  >
                    <Ionicons
                      name="refresh"
                      size={15}
                      color={COLORS.primary}
                    />
                    <Text className="ms-1 text-xs text-primary font-medium">
                      {t("subscriptions.reactivate_plan")}
                    </Text>
                  </PressableOpacity>
                ) : (
                  <PressableOpacity
                    onPress={() => void removeRow(row.key)}
                    accessibilityLabel={t("subscriptions.remove_plan")}
                    hitSlop={8}
                    className="flex-row items-center px-2 py-1 -me-1"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={COLORS.danger}
                    />
                    <Text className="ms-1 text-xs text-danger font-medium">
                      {t("subscriptions.remove_plan")}
                    </Text>
                  </PressableOpacity>
                )}
              </View>
            ) : null}

            {/* Fields — plan picker + start date on one line. Cancelled rows are
                read-only (disabled) until reactivated. */}
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <PlanPicker
                  branchId={branchId}
                  value={row.planId}
                  onChange={(v) => setRowPlan(row.key, v)}
                  label={t("customers.plan_label")}
                  onAddNew={() => setAddPlanOpen(true)}
                  disabled={cancelled || branchId === null}
                  disabledHint={t("subscriptions.select_branch_first")}
                />
              </View>
              <View className="w-44">
                <DatePickerInput
                  label={t("subscriptions.start_label")}
                  value={row.startDate}
                  onChange={(v) => setRowStartDate(row.key, v)}
                  placeholder={t("customers.start_date_placeholder")}
                  disabled={cancelled}
                />
              </View>
            </View>
          </View>
        );
      })}

      {/* Add line — dashed affordance */}
      <PressableOpacity
        onPress={addRow}
        className="flex-row items-center justify-center rounded-2xl border border-dashed border-gray-300 py-3"
      >
        <Ionicons name="add" size={18} color={COLORS.primary} />
        <Text className="text-primary text-sm font-semibold ms-1">
          {t("subscriptions.add_plan")}
        </Text>
      </PressableOpacity>

      {addPlanOpen && <PlanFormSheet onDismiss={() => setAddPlanOpen(false)} />}
    </View>
  );
}
