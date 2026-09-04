import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirm } from "@/src/shared/lib/confirm";
import { useConfirmStore } from "@/src/shared/lib/confirmStore";

/**
 * Wraps a sheet's `onDismiss` so closing a **dirty** form asks to discard first.
 *
 * Returns a guarded dismiss handler: when `dirty` is false it just calls
 * `onDismiss`; when true it awaits the global confirm dialog and only dismisses
 * if the user picks "Discard". Used by {@link AppBottomSheet}, so the SAME guard
 * covers every close path a sheet has — the header Cancel/Close button, Android
 * hardware-back, browser Back, the drag-down gesture and a backdrop tap — and
 * every form inherits it just by passing `dirty`.
 *
 * Re-entrancy: the dialog is `await`ed, so a second close attempt can arrive
 * while it is still open (Back pressed twice, or a drag while it shows). A
 * pending flag drops those instead of stacking a second dialog.
 *
 * Returns `[guardedDismiss, asking]`. **`asking` must be used to switch the
 * caller's own Back handling off while the prompt is up.** The prompt is a native
 * `Modal` that handles Back through `onRequestClose`, but the sheet's
 * `hardwareBackPress` listener underneath stays registered — so one Back press
 * dismissed the dialog AND re-triggered the sheet's close, which showed the
 * prompt again and eventually let a press through to the router ("clicking
 * discard shows another popup, then goes back a page").
 *
 * `asking` is React state, so it lands a render later. Callers that need to
 * suppress a SYNCHRONOUS re-entry in the same tick don't need their own flag —
 * `guardedDismiss` is already idempotent while a prompt is pending.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  onDismiss: () => void,
  onKeepOpen?: () => void,
): [guardedDismiss: () => void, asking: boolean] {
  const { t } = useTranslation();

  // Latest values without re-creating the callback (it feeds effect deps in
  // AppBottomSheet's back handlers — churning it would rebind those listeners).
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onKeepOpenRef = useRef(onKeepOpen);
  onKeepOpenRef.current = onKeepOpen;

  const askingRef = useRef(false);
  const [asking, setAsking] = useState(false);

  // The owning sheet is gone (parent unmounted it, screen navigated away). The
  // confirm dialog is a standalone store, so it outlives us — it must neither be
  // left floating nor be opened on our way out.
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
    // Asking on behalf of a sheet that no longer exists would strand the prompt
    // on screen after the form closed — the user has nothing left to answer for.
    if (deadRef.current) return;
    if (askingRef.current) return;
    askingRef.current = true;
    setAsking(true);
    // No try/finally — this compiler version rejects `finally` outright (gotcha
    // #52) and `show()` never rejects, so a plain reset after the await is safe.
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
    // Cleared LAST, so the caller's Back handling stays off for the press that
    // answered the dialog — re-enabling it earlier is what let one press both
    // answer the prompt and close the sheet underneath.
    setAsking(false);
  }, [t]);

  // The exposed callback returns void: it's an event handler, and nothing awaits it.
  const dismiss = useCallback(() => void guardedDismiss(), [guardedDismiss]);

  return [dismiss, asking];
}
