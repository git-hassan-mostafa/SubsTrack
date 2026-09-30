import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Currency } from "@shared/core/types";
import { formatMoney, snapshotCurrency } from "@shared/core/utils/currency";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  collectionService,
  type CollectionCorrection,
  type CorrectionDraft,
} from "@shared/modules/ledger/services/CollectionService";
import type { CurrencyPlan } from "@shared/modules/ledger/utils/currencyGroups";
import {
  correctionPlan,
  correctionProblem,
  correctionReason,
  type CorrectionProblem,
} from "@shared/modules/ledger/utils/correction";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

export interface CorrectPaymentForm {
  draft: CorrectionDraft | null;
  original: Collection | null;
  loadError: string | null;
  error: string | null;
  clearError: () => void;
  currencies: Currency[];
  plan: CurrencyPlan | null;
  problem: CorrectionProblem | null;
  money: (value: number) => string;
  setAmount: (next: number | null) => void;
  note: string;
  setNote: (next: string) => void;
  dirty: boolean;
  canSave: boolean;
  save: () => Promise<CollectionCorrection | null>;
}

// Correct amount = void + re-record the same hand-over in one write (#171).
export function useCorrectPayment(collectionId: string): CorrectPaymentForm {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currencies = useCurrencySlice((s) => s.items);
  const correctCollection = useLedgerSlice((s) => s.correctCollection);
  const error = useLedgerSlice((s) => s.error);
  const clearError = useLedgerSlice((s) => s.clearError);

  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setTypedAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let current = true;
    collectionService.getCorrection(collectionId).then(
      (next) => {
        if (!current) return;
        setDraft(next);
        setTypedAmount(next.collection.amount);
      },
      (e: unknown) => {
        if (current) setLoadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      current = false;
    };
  }, [collectionId]);

  useEffect(() => () => clearError(), [clearError]);

  const plan = useMemo(
    () => (draft ? correctionPlan(draft.pool, amount, currencies) : null),
    [draft, amount, currencies],
  );

  const original = draft?.collection ?? null;
  const source = original ? snapshotCurrency(original, currencies) : null;
  const money = (value: number) => formatMoney(value, source, source);
  const problem = original && plan ? correctionProblem(original.amount, plan) : null;
  const dirty = !!original && (problem !== "unchanged" || note.trim() !== "");
  const canSave = !!original && !!plan && !!user && problem === null;

  const setAmount = useCallback(
    (next: number | null) => {
      clearError();
      setTypedAmount(next);
    },
    [clearError],
  );

  const save = async (): Promise<CollectionCorrection | null> => {
    if (!canSave || !original || !user || amount === null) return null;
    return correctCollection({
      collectionId,
      amount,
      actorUserId: user.id,
      reason: correctionReason(money(original.amount), money(amount), note, t),
    });
  };

  return {
    draft,
    original,
    loadError,
    error,
    clearError,
    currencies,
    plan,
    problem,
    money,
    setAmount,
    note,
    setNote,
    dirty,
    canSave,
    save,
  };
}
