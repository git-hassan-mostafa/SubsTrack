import { useEffect, useState } from "react";
import { getTodayDateString } from "@shared/core/utils/date";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { newCustomerBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  customerImportService,
  type ImportProgress,
} from "@shared/modules/customer/customer-import/services/CustomerImportService";
import { importCounts, type ImportCounts } from "@shared/modules/customer/customer-import/utils/importResult";
import type { ImportPreview, ImportRunResult } from "@shared/modules/customer/customer-import/utils/types";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useBillingSlice } from "@shared/state/hooks/useBillingSlice";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useCurrencySlice } from "@shared/state/hooks/useCurrencySlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

export type ImportPhase = "pick" | "reading" | "preview" | "importing" | "done";

export interface CustomerImport {
  phase: ImportPhase;
  lookupsReady: boolean;
  preview: ImportPreview | null;
  counts: ImportCounts | null;
  progress: ImportProgress;
  result: ImportRunResult | null;
  error: string | null;
  tooBig: string | null;
  openSheet: (fileName: string, sheet: string[][]) => Promise<void>;
  failRead: (message: string) => void;
  start: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

const NO_PROGRESS: ImportProgress = { done: 0, total: 0 };

// The page reads the file; the plan, branch and currency lists must be loaded first.
export function useCustomerImport(onImported: (result: ImportRunResult) => void): CustomerImport {
  const { user } = useAuth();
  const activeBranches = useActiveBranches();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const branchesLoaded = useBranchSlice((s) => s.loaded);
  const plans = usePlanSlice((s) => s.items);
  const plansLoaded = usePlanSlice((s) => s.loaded);
  const getPlans = usePlanSlice((s) => s.getPlans);
  const currencies = useCurrencySlice((s) => s.items);
  const currenciesLoaded = useCurrencySlice((s) => s.loaded);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const limits = useBillingSlice((s) => s.limits);
  const bumpActive = useBillingSlice((s) => s.bumpActive);
  const [phase, setPhase] = useState<ImportPhase>("pick");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [progress, setProgress] = useState<ImportProgress>(NO_PROGRESS);
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);

  useEffect(() => {
    void getPlans();
    void getCurrencies();
  }, [getPlans, getCurrencies]);

  const openSheet = async (fileName: string, sheet: string[][]) => {
    setError(null);
    setTooBig(null);
    setPhase("reading");
    try {
      const phoneOwners = await customerImportService.getPhoneOwners();
      setPreview(
        customerImportService.preview(fileName, sheet, {
          branches: activeBranches,
          plans,
          currencies,
          phoneOwners,
          ownBranchId: user?.branchId ?? null,
          defaultBranchId: newCustomerBranchId(user, activeBranches, currentBranchId),
          today: getTodayDateString(),
        }),
      );
      setPhase("preview");
    } catch (e) {
      setError((e as Error).message);
      setPhase("pick");
    }
  };

  const failRead = (message: string) => {
    setError(message);
    setPhase("pick");
  };

  const start = async () => {
    if (!user || !preview || phase !== "preview") return;
    const ready = preview.customers.filter((c) => c.ready);
    if (ready.length === 0) return;
    setError(null);
    setTooBig(null);
    setPhase("importing");
    try {
      await customerImportService.assertFits(limits, ready);
    } catch (e) {
      if (e instanceof QuotaExceededError) setTooBig(customerImportService.tooBigMessage(e, ready));
      else setError((e as Error).message);
      setPhase("preview");
      return;
    }
    try {
      const run = await customerImportService.importCustomers(ready, user.tenantId, setProgress);
      bumpActive({ customers: run.importedCustomers, plans: run.importedLines });
      setResult(run);
      setPhase("done");
      onImported(run);
    } catch (e) {
      setError((e as Error).message);
      setPhase("preview");
    }
  };

  const reset = () => {
    setPhase("pick");
    setPreview(null);
    setProgress(NO_PROGRESS);
    setResult(null);
    setError(null);
    setTooBig(null);
  };

  return {
    phase,
    lookupsReady: branchesLoaded && plansLoaded && currenciesLoaded,
    preview,
    counts: preview ? importCounts(preview) : null,
    progress,
    result,
    error,
    tooBig,
    openSheet,
    failRead,
    start,
    reset,
    clearError: () => setError(null),
  };
}
