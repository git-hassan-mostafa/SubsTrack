import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import i18n from "@/src/core/i18n";
import type { AuditEntry } from "@/src/core/types";
import { formatDateTime } from "@/src/core/utils/date";
import { COLORS } from "@/src/shared/constants";
import { Text } from "@/src/shared/components/Text";
import { FormSheet } from "@/src/shared/components/FormSheet";
import { DirectionalIcon } from "@/src/shared/components/DirectionalIcon";
import { useAuditLookups } from "../hooks/useAuditLookups";
import {
  actionLabel,
  changedFieldsLabel,
  formatField,
  formatFieldLabel,
  subjectLabel,
  tableLabel,
} from "../utils/format";
import { showsColumn, type AuditFieldContext } from "../utils/valueDisplay";

interface AuditEntrySheetProps {
  entry: AuditEntry;
  onDismiss: () => void;
}

/** One audit entry in full: who, when, and every field that moved. */
export function AuditEntrySheet({ entry, onDismiss }: AuditEntrySheetProps) {
  const { t } = useTranslation();

  const lookups = useAuditLookups();
  const ctx = useMemo<AuditFieldContext>(
    () => ({
      t,
      locale: i18n.language,
      table: entry.table,
      row: entry.context,
      lookups,
    }),
    [t, entry.table, entry.context, lookups],
  );
  const changedFields = changedFieldsLabel(entry, ctx);

  const snapshotRows = entry.snapshot
    ? Object.entries(entry.snapshot).filter(([k]) =>
        showsColumn(entry.table, k),
      )
    : [];

  return (
    <FormSheet
      onDismiss={onDismiss}
      title={`${actionLabel(t, entry.action)} · ${tableLabel(t, entry.table)}`}
      dismissLabel={t("common.close")}
    >
      {/* Who + when, then what moved (an edit only — a create/delete has no diff). */}
      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        {/* The frozen parent name — now the only row naming WHOSE record this is,
            so it shows on `customers` entries too (the record there IS the person).
            Usually a customer; a stock movement's parent is its product. */}
        {entry.subject ? (
          <Row label={subjectLabel(t, entry.table)} value={entry.subject} />
        ) : null}
        <Row
          label={t("audit.filter_by_actor")}
          value={entry.actorUsername ?? t("audit.unknown_actor")}
        />
        {/* Not payments.paid_on — this is when the change was made, on any table. */}
        <Row
          label={t("audit.occurred_at")}
          value={formatDateTime(entry.occurredAt, i18n.language)}
          last={!changedFields}
        />
        {changedFields ? (
          <Row label={t("audit.changed_fields")} value={changedFields} last />
        ) : null}
      </View>

      {/* The diff: old → new, one row per changed field */}
      {entry.changes.length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          {entry.changes.map((c, i) => (
            <View
              key={c.field}
              className={`px-4 py-3.5 ${i < entry.changes.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <Text className="text-xs text-gray-400">
                {formatFieldLabel(c.field, ctx)}
              </Text>
              <View className="flex-row items-center gap-2 mt-1">
                <Text
                  className="text-sm text-gray-400 line-through flex-shrink"
                  numberOfLines={2}
                >
                  {formatField(c.field, c.before, ctx)}
                </Text>
                <DirectionalIcon
                  name="arrow-forward"
                  size={13}
                  color={COLORS.gray400}
                />
                <Text
                  className="text-sm font-semibold text-gray-900 flex-1"
                  numberOfLines={2}
                >
                  {formatField(c.field, c.after, ctx)}
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
              label={formatFieldLabel(key, ctx)}
              value={formatField(key, value, ctx)}
              last={i === snapshotRows.length - 1}
            />
          ))}
        </View>
      ) : null}

      {entry.changes.length === 0 && snapshotRows.length === 0 ? (
        <Text className="text-sm text-gray-400 text-center py-4">
          {t("audit.no_fields")}
        </Text>
      ) : null}
    </FormSheet>
  );
}

function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row justify-between items-center px-4 py-3.5 ${last ? "" : "border-b border-gray-100"}`}
    >
      <Text className="text-sm text-gray-400">{label}</Text>
      <Text
        className="text-sm font-semibold text-gray-900 flex-1 ms-4 text-right"
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}
