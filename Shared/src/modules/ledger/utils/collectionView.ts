import type { CollectionListItem } from "@shared/core/types";
import { formatDateTime } from "@shared/core/utils/date";
import type { LabeledValue } from "./billView";

type Translate = (key: string, opts?: Record<string, unknown>) => string;
type UserName = (id: string | null) => string | null;

// Every field one hand-over MIGHT print; custody only while it still counts.
export function collectionInfoRows(
  collection: CollectionListItem,
  t: Translate,
  userName: UserName,
): LabeledValue[] {
  const voided = collection.voidedAt !== null;
  const banked = !voided && collection.heldByUserId === null;
  const received = formatDateTime(collection.receivedAt);
  const recorded = formatDateTime(collection.createdAt);
  const unknown = t("common.unknown");
  const heldBy = banked ? t("ledger.banked") : (userName(collection.heldByUserId) ?? unknown);
  return [
    { label: t("ledger.received_at"), value: received },
    { label: t("ledger.recorded_at"), value: recorded !== received ? recorded : null },
    { label: t("ledger.collected_by"), value: userName(collection.receivedByUserId) ?? unknown },
    { label: t("ledger.held_by"), value: voided ? null : heldBy },
    {
      label: t("ledger.banked_at"),
      value: banked && collection.remittedAt ? formatDateTime(collection.remittedAt) : null,
    },
    { label: t("ledger.banked_by"), value: banked ? userName(collection.remittedBy) : null },
    { label: t("ledger.notes"), value: collection.notes },
    {
      label: t("ledger.voided_at"),
      value: collection.voidedAt ? formatDateTime(collection.voidedAt) : null,
    },
    { label: t("ledger.voided_by"), value: userName(collection.voidedBy) },
    { label: t("ledger.void_reason_label"), value: collection.voidReason },
  ];
}
