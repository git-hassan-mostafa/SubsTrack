import { useEffect, useMemo, useState } from "react";
import type { AuditRecordTarget } from "@shared/core/types";
import { useRecordHistory, type RecordHistoryState } from "@shared/modules/admin/audit/hooks/useRecordHistory";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";

const NO_TARGETS: AuditRecordTarget[] = [];

// A record's trail WITH its bill and every hand-over that ever settled it.
export function useBillHistory(
  chargeId: string | null,
  targets: AuditRecordTarget[] = NO_TARGETS,
): RecordHistoryState {
  const [paymentTargets, setPaymentTargets] = useState<AuditRecordTarget[]>(NO_TARGETS);

  useEffect(() => {
    if (!chargeId) return;
    let current = true;
    collectionService.getPaymentTargets(chargeId).then(
      (found) => {
        if (current) setPaymentTargets(found);
      },
      () => {
        if (current) setPaymentTargets(NO_TARGETS);
      },
    );
    return () => {
      current = false;
    };
  }, [chargeId]);

  const merged = useMemo(() => {
    const all = [
      ...targets,
      ...(chargeId ? [{ table: "charges" as const, recordId: chargeId }] : []),
      ...paymentTargets,
    ];
    const seen = new Set<string>();
    return all.filter((target) => {
      const key = `${target.table}:${target.recordId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [targets, chargeId, paymentTargets]);

  return useRecordHistory(merged);
}
