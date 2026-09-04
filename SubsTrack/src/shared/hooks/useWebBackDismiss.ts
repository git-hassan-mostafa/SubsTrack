import { useEffect, useRef } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

interface ModalEntry {
  dismiss: () => void;
  defersClose?: () => boolean;
}

const dismissStack: ModalEntry[] = [];
let listenerBound = false;

let sentinelCount = 0;
let selfPops = 0;
let reconcileScheduled = false;

function pushSentinel() {
  sentinelCount += 1;
  window.history.pushState({ ...window.history.state, __modal: true }, "");
}

function popSentinel() {
  sentinelCount -= 1;
  selfPops += 1;
  window.history.back();
}

// Bring the sentinel count in line with the modal count once per tick.
// Coalescing across a tick is what makes a handoff safe: if a modal closes and
// another opens in the same tick the depth is unchanged, so history is left
// untouched.
function scheduleReconcile() {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  queueMicrotask(() => {
    reconcileScheduled = false;
    while (sentinelCount < dismissStack.length) pushSentinel();
    while (sentinelCount > dismissStack.length) popSentinel();
  });
}

function handlePopState() {
  if (selfPops > 0) {
    selfPops -= 1;
    return;
  }
  if (sentinelCount > 0) sentinelCount -= 1;

  const top = dismissStack[dismissStack.length - 1];
  if (!top) return;

  if (top.defersClose?.()) {
    scheduleReconcile();
    top.dismiss();
    return;
  }

  dismissStack.pop();
  top.dismiss();
}

/**
 * A surface that asks a question before closing (a dirty form's "Discard
 * changes?") passes `defersClose` — a predicate saying "a Back press right now
 * only opens my prompt, it does not close me". Such a surface STAYS registered
 * while its dialog is up: the dialog pushes its own entry on top and owns Back,
 * and the entry underneath keeps its sentinel so the history depth still matches
 * the stack. Deregistering it instead (passing `active: false` for the duration)
 * silently dropped one real sentinel and left the dialog's close running a
 * `history.back()` that popped the ROUTE. See `useUnsavedChangesGuard`.
 */
export function useWebBackDismiss(
  active: boolean,
  onDismiss: () => void,
  defersClose?: () => boolean,
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const defersCloseRef = useRef(defersClose);
  defersCloseRef.current = defersClose;

  useEffect(() => {
    if (!isWeb || !active) return;

    const entry: ModalEntry = {
      dismiss: () => onDismissRef.current(),
      defersClose: () => defersCloseRef.current?.() ?? false,
    };
    dismissStack.push(entry);
    if (!listenerBound) {
      window.addEventListener("popstate", handlePopState);
      listenerBound = true;
    }
    scheduleReconcile();

    return () => {
      const idx = dismissStack.indexOf(entry);
      if (idx !== -1) dismissStack.splice(idx, 1);
      scheduleReconcile();
    };
  }, [active]);
}
