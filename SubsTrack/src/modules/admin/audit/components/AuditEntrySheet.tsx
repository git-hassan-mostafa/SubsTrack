import { useCallback, useEffect, useMemo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import i18n from "@/src/core/i18n";
import type { AuditEntry } from "@/src/core/types";
import { formatDateTime } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";
import { actionLabel, fieldLabel, formatField, tableLabel } from "../utils/format";

interface AuditEntrySheetProps {
  entry: AuditEntry;
  onDismiss: () => void;
}

/** One audit entry in full: who, when, and every field that moved. */
export function AuditEntrySheet({ entry, onDismiss }: AuditEntrySheetProps) {
  const { t } = useTranslation();

  // Person columns (voided_by, remitted_by, …) store a user id; resolve it to a
  // name for display. `getUsers` self-guards on its `loaded` flag, so calling it
  // here costs nothing when the list is already in the store — needed because this
  // sheet also opens from RecordHistorySheet, which never loaded it.
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);
  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);
  const lookupUser = useCallback((id: string) => usersById.get(id) ?? null, [usersById]);

  // A create/delete has no diff — it carries the whole row instead, which we show
  // as a plain field list (nothing "changed from", so no arrow).
  const snapshotRows = entry.snapshot
    ? Object.entries(entry.snapshot).filter(([k]) => !k.endsWith("_id") || k === "branch_id")
    : [];

  return (
    <FormSheet
      onDismiss={onDismiss}
      title={`${actionLabel(t, entry.action)} · ${tableLabel(t, entry.table)}`}
      dismissLabel={t("common.close")}
    >
      {/* Who + when */}
      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        <Row
          label={t("audit.filter_by_actor")}
          value={entry.actorUsername ?? t("audit.unknown_actor")}
        />
        {/* Not payments.paid_on — this is when the change was made, on any table. */}
        <Row
          label={t("audit.occurred_at")}
          value={formatDateTime(entry.occurredAt, i18n.language)}
          last={!entry.label}
        />
        {entry.label ? <Row label={t("audit.record")} value={entry.label} last /> : null}
      </View>

      {/* The diff: old → new, one row per changed field */}
      {entry.changes.length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          {entry.changes.map((c, i) => (
            <View
              key={c.field}
              className={`px-4 py-3.5 ${i < entry.changes.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <Text className="text-xs text-gray-400">{fieldLabel(t, c.field)}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <Text className="text-sm text-gray-400 line-through flex-shrink" numberOfLines={2}>
                  {formatField(t, c.field, c.before, i18n.language, lookupUser)}
                </Text>
                <Ionicons name="arrow-forward" size={13} color={COLORS.gray400} />
                <Text
                  className="text-sm font-semibold text-gray-900 flex-1"
                  numberOfLines={2}
                >
                  {formatField(t, c.field, c.after, i18n.language, lookupUser)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Whole-row snapshot (create / delete) */}
      {snapshotRows.length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          {snapshotRows.map(([key, value], i) => (
            <Row
              key={key}
              label={fieldLabel(t, key)}
              value={formatField(t, key, value, i18n.language, lookupUser)}
              last={i === snapshotRows.length - 1}
            />
          ))}
        </View>
      ) : null}

      {entry.changes.length === 0 && snapshotRows.length === 0 ? (
        <Text className="text-sm text-gray-400 text-center py-4">{t("audit.no_fields")}</Text>
      ) : null}
    </FormSheet>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      className={`flex-row justify-between items-center px-4 py-3.5 ${last ? "" : "border-b border-gray-100"}`}
    >
      <Text className="text-sm text-gray-400">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right" numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}
