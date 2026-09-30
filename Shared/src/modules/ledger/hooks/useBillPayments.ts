import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@shared/core/types";
import { collectionService, type CollectionCorrection } from "@shared/modules/ledger/services/CollectionService";
import { paidToCharge } from "@shared/modules/ledger/utils/paidToCharge";

export interface BillPayments {
  payments: Collection[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  live: Collection[];
  collected: number;
  markVoided: (voided: Collection) => void;
  markCorrected: (correction: CollectionCorrection) => void;
}

const NONE: Collection[] = [];

// Every hand-over on ONE bill, patched in place by a void or a correction (#109).
export function useBillPayments(chargeId: string | null, active: boolean): BillPayments {
  const [payments, setPayments] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPayments(null);
  }, [chargeId]);

  useEffect(() => {
    if (!active) return;
    if (!chargeId) {
      setPayments([]);
      return;
    }
    let current = true;
    collectionService.getPaymentsForCharge(chargeId).then(
      (found) => {
        if (current) setPayments(found);
      },
      (e: unknown) => {
        if (!current) return;
        setError(e instanceof Error ? e.message : String(e));
        setPayments([]);
      },
    );
    return () => {
      current = false;
    };
  }, [chargeId, active]);

  const markVoided = useCallback((voided: Collection) => {
    setPayments((prev) => (prev ?? []).map((p) => (p.id === voided.id ? voided : p)));
  }, []);

  const markCorrected = useCallback(
    ({ voided, replacement }: CollectionCorrection) => {
      const stillHere = paidToCharge(replacement, chargeId) > 0;
      setPayments((prev) =>
        (prev ?? []).flatMap((p) => {
          if (p.id !== voided.id) return [p];
          return stillHere ? [replacement, voided] : [voided];
        }),
      );
    },
    [chargeId],
  );

  const clearError = useCallback(() => setError(null), []);

  const rows = payments ?? NONE;
  const live = rows.filter((p) => p.voidedAt === null);
  const collected = live.reduce((sum, p) => sum + paidToCharge(p, chargeId), 0);

  return {
    payments: rows,
    loading: payments === null,
    error,
    clearError,
    live,
    collected,
    markVoided,
    markCorrected,
  };
}
