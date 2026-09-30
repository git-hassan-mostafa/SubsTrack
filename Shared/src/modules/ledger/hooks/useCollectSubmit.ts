import { useTranslation } from "react-i18next";
import type { Collection } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { collectInputsFor, type CollectSubmission } from "@shared/modules/ledger/utils/collectForm";
import { confirm } from "@shared/shared/lib/confirm";
import { useLedgerSlice } from "@shared/state/hooks/useLedgerSlice";

// A hand-over already saved is real money: close the form, never let it be retried.
export function useCollectSubmit(): (
  submission: CollectSubmission,
  customerId: string,
) => Promise<Collection[]> {
  const { t } = useTranslation();
  const { user } = useAuth();
  const collectMulti = useLedgerSlice((s) => s.collectMulti);
  const clearError = useLedgerSlice((s) => s.clearError);

  return async (submission, customerId) => {
    if (!user) return [];
    const { collections, failed } = await collectMulti(
      collectInputsFor(submission, {
        tenantId: user.tenantId,
        receivedByUserId: user.id,
        customerId,
        fallbackBranchId: user.branchId,
      }),
    );
    if (failed && collections.length > 0) {
      clearError();
      void confirm({
        title: t("ledger.partly_saved_title"),
        message: t("ledger.partly_saved_message", { error: failed.message }),
        confirmLabel: t("common.ok"),
        hideCancel: true,
      });
    }
    return collections;
  };
}
