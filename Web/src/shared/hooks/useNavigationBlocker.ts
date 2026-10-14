import { useCallback, useEffect } from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { useUnsavedChangesGuard } from "@shared/shared/hooks/useUnsavedChangesGuard";
import { useFormDialogRegistry } from "@/state/formDialogRegistry";

export const LEAVE_FORMS_NAVIGATION = { state: { leaveForms: true } } as const;

// prevents client route navigation while any open dialog is dirty
export function useNavigationBlocker() {
  const anyDirty = useFormDialogRegistry((s) =>
    Object.values(s.dialogs).some((d) => d.dirty),
  );
  const shouldBlock = useCallback<BlockerFunction>(
    ({ nextLocation, historyAction }) => {
      const leaveForms =
        (nextLocation.state as { leaveForms?: boolean } | null)?.leaveForms ===
        true;
      return anyDirty && !(historyAction !== "POP" && leaveForms);
    },
    [anyDirty],
  );
  const blocker = useBlocker(shouldBlock);

  const discardAndProceed = () => {
    const dirtyDialogs = Object.values(
      useFormDialogRegistry.getState().dialogs,
    ).filter((d) => d.dirty);
    for (const dialog of dirtyDialogs) {
      dialog.onClose();
    }
    blocker.proceed?.();
  };

  const keepEditing = () => {
    blocker.reset?.();
  };

  const [guardedDismiss] = useUnsavedChangesGuard(
    true,
    discardAndProceed,
    keepEditing,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      guardedDismiss();
    }
  }, [blocker.state, guardedDismiss]);
}
