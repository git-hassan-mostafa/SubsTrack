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
import type { LineDraft } from "@/src/modules/customer/customer-plans";
import { getTodayDateString } from "@/src/core/utils/date";
import { usePlanSlice } from "@/src/state/hooks/usePlanSlice";
import { PlanFormSheet } from "@/src/modules/admin/plans";

// One row in the inline Plans editor. `id` present = an existing line being
// kept/edited; absent = a new line to create. `startDate` is preserved for
// existing lines; new lines inherit the customer's start date on save.
type PlanRow = {
  key: string;
  id?: string;
  planId: string | null;
  startDate: string;
};

// What the parent form reads back on submit. Lines are the active rows turned
// into drafts; removedIds are existing lines the user deleted.
export interface CustomerPlansEditorHandle {
  getLines: () => LineDraft[];
  getRemovedIds: () => string[];
}

interface Props {
  customer?: Customer | null;
  // The customer's currently-selected branch. Scopes the PlanPicker and drops
  // any row plan that no longer belongs to the branch when it changes.
  branchId: string | null;
  // The customer's start date — new lines inherit it.
  startDate: string;
  ref: Ref<CustomerPlansEditorHandle>;
}

// Inline Plans (service lines) editor. Owns the row state for a customer's
// service lines — add / change / remove inline. A customer always keeps at
// least one line; a plan-less line records custom amounts only. The parent form
// drives submit and reads the drafts through the imperative ref handle.
export function CustomerPlansEditor({
  customer,
  branchId,
  startDate,
  ref,
}: Props) {
  const { t } = useTranslation();
  const plans = usePlanSlice((s) => s.items);

  const rowKey = useRef(0);
  const newRow = (date: string): PlanRow => ({
    key: `new-${rowKey.current++}`,
    planId: null,
    startDate: date,
  });

  // Existing customer → one row per active line; new customer → one empty row.
  const [rows, setRows] = useState<PlanRow[]>(() => {
    const active = (customer?.customerPlans ?? []).filter((l) => l.active);
    if (active.length > 0) {
      return active.map((l) => ({
        key: l.id,
        id: l.id,
        planId: l.planId,
        startDate: l.startDate,
      }));
    }
    return [newRow(customer?.startDate ?? getTodayDateString())];
  });
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [addPlanOpen, setAddPlanOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    getLines: () =>
      rows.map((r) => ({ id: r.id, planId: r.planId, startDate: r.startDate })),
    getRemovedIds: () => removedIds,
  }));

  // When the branch changes, drop any selected plan that's branch-specific to a
  // different branch (shared plans — branchId null — stay valid everywhere).
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (!r.planId) return r;
        const p = plans.find((pl) => pl.id === r.planId);
        if (p && p.branchId !== null && p.branchId !== branchId) {
          return { ...r, planId: null };
        }
        return r;
      }),
    );
  }, [branchId, plans]);

  function setRowPlan(key: string, planId: string | null) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, planId } : r)));
  }

  function setRowStartDate(key: string, date: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, startDate: date } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, newRow(startDate)]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // keep at least one line
      const target = prev.find((r) => r.key === key);
      if (target?.id) setRemovedIds((ids) => [...ids, target.id!]);
      return prev.filter((r) => r.key !== key);
    });
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
      {rows.map((row, i) => (
        <View
          key={row.key}
          className="rounded-2xl border border-gray-200 bg-gray-50 px-3.5 pt-4 mb-3"
        >
          {/* Card header — line number + remove. Hidden when there's a single
                line so the common case stays uncluttered. */}
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
              </View>
              <PressableOpacity
                onPress={() => removeRow(row.key)}
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
            </View>
          ) : null}

          {/* Fields — plan picker + start date on one line */}
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <PlanPicker
                branchId={branchId}
                value={row.planId}
                onChange={(v) => setRowPlan(row.key, v)}
                label={t("customers.plan_label")}
                onAddNew={() => setAddPlanOpen(true)}
                disabled={branchId === null}
                disabledHint={t("subscriptions.select_branch_first")}
              />
            </View>
            <View className="w-44">
              <DatePickerInput
                label={t("subscriptions.start_label")}
                value={row.startDate}
                onChange={(v) => setRowStartDate(row.key, v)}
                placeholder={t("customers.start_date_placeholder")}
              />
            </View>
          </View>
        </View>
      ))}

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
