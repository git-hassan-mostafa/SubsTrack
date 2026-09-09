import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@/src/shared/lib/confirm";
import { useConfirmStore } from "@/src/shared/lib/confirmStore";

// `asking` must switch the caller's own Back handling off — see gotcha #54
export function useUnsavedChangesGuard(
  dirty: boolean,
  onDismiss: () => void,
  onKeepOpen?: () => void,
): [guardedDismiss: () => void, asking: boolean] {
  const { t } = useTranslation();

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onKeepOpenRef = useRef(onKeepOpen);
  onKeepOpenRef.current = onKeepOpen;

  const askingRef = useRef(false);
  const [asking, setAsking] = useState(false);

  const deadRef = useRef(false);
  useEffect(
    () => () => {
      deadRef.current = true;
      if (askingRef.current) useConfirmStore.getState().settle(false);
    },
    [],
  );

  const guardedDismiss = useCallback(async () => {
    if (!dirtyRef.current) {
      onDismissRef.current();
      return;
    }
    if (deadRef.current) return;
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);
    const discard = await confirm({
      title: t("common.discard_changes_title"),
      message: t("common.discard_changes_message"),
      confirmLabel: t("common.discard"),
      cancelLabel: t("common.keep_editing"),
      destructive: true,
    });
    askingRef.current = false;
    if (discard) onDismissRef.current();
    else onKeepOpenRef.current?.();
    setAsking(false);
  }, [t]);

  const dismiss = useCallback(() => void guardedDismiss(), [guardedDismiss]);

  return [dismiss, asking];
}
