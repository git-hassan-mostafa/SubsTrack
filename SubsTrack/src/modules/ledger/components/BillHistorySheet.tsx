import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditRecordTarget } from "@/src/core/types";
import { HistorySheet, useRecordHistory } from "@/src/modules/admin/audit";
import { collectionService } from "../services/CollectionService";

interface Props {
  /** The rows this record is made of, besides its bill and the cash on it. */
  targets?: AuditRecordTarget[];
  chargeId: string | null;
  subtitle?: string | null;
  onDismiss: () => void;
}

/**
 * A record's change timeline WITH the money on it — the record's own rows, its
 * bill and every hand-over that ever settled it, merged newest-first.
 *
 * A plain RecordHistorySheet pulls one table, so a sale's trail showed the sale
 * being raised and voided but never the cash that paid it: that lives in `charges`
 * and `collections`, which are different rows with different ids. The collection
 * ids are on no record, so they are resolved once when the sheet opens.
 */
export function BillHistorySheet({
  targets = [],
  chargeId,
  subtitle,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const [paymentTargets, setPaymentTargets] = useState<AuditRecordTarget[]>([]);

  useEffect(() => {
    if (!chargeId) return;
    let active = true;
    collectionService
      .getPaymentTargets(chargeId)
      .then((found) => {
        if (active) setPaymentTargets(found);
      })
      .catch(() => {
        if (active) setPaymentTargets([]);
      });
    return () => {
      active = false;
    };
  }, [chargeId]);

  const merged = useMemo(() => {
    const all = [
      ...targets,
      ...(chargeId ? [{ table: "charges" as const, recordId: chargeId }] : []),
      ...paymentTargets,
    ];
    const seen = new Set<string>();
    return all.filter((tr) => {
      const key = `${tr.table}:${tr.recordId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [targets, chargeId, paymentTargets]);

  const timeline = useRecordHistory(merged);

  return (
    <HistorySheet
      title={t("audit.record_history_title")}
      subtitle={subtitle}
      timeline={timeline}
      onDismiss={onDismiss}
    />
  );
}
