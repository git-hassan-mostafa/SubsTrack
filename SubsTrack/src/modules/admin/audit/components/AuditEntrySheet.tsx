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
import {
  actionLabel,
  changedFieldsLabel,
  formatField,
  formatFieldLabel,
  subjectLabel,
  tableLabel,
} from "../utils/format";
import { buildAuditSummary } from "../utils/summary";
import {
  fieldContext,
  showsColumn,
  type AuditContextBase,
} from "../utils/valueDisplay";
import { AuditSummaryText } from "./AuditSummaryText";

interface AuditEntrySheetProps {
  entry: AuditEntry;
  base: AuditContextBase;
  onDismiss: () => void;
}

/** One audit entry in full: the sentence, then who, when, and every field that moved. */
export function AuditEntrySheet({
  entry,
  base,
  onDismiss,
}: AuditEntrySheetProps) {
  const { t } = useTranslation();

  const ctx = useMemo(() => fieldContext(base, entry), [base, entry]);
  const summary = useMemo(() => buildAuditSummary(entry, ctx), [entry, ctx]);
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
      <View className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 mb-4">
        <AuditSummaryText
          parts={summary}
          className="text-[15px] leading-6 text-gray-900"
        />
      </View>

      <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        {entry.subject ? (
          <Row label={subjectLabel(t, entry.table)} value={entry.subject} />
        ) : null}
        <Row
          label={t("audit.filter_by_actor")}
          value={entry.actorUsername ?? t("audit.unknown_actor")}
        />
        <Row
          label={t("audit.occurred_at")}
          value={formatDateTime(entry.occurredAt, i18n.language)}
          last={!changedFields}
        />
        {changedFields ? (
          <Row label={t("audit.changed_fields")} value={changedFields} last />
        ) : null}
      </View>

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
