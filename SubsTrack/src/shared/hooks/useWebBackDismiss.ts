import { useEffect, useRef } from "react";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

const dismissStack: (() => void)[] = [];
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

// coalesced so a handoff inside one tick leaves history untouched — gotcha #44
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
  dismissStack.pop()?.();
}

// browser Back closes the top web overlay, never a sheet — gotcha #44
export function useWebBackDismiss(active: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isWeb || !active) return;

    const dismiss = () => onDismissRef.current();
    dismissStack.push(dismiss);
    if (!listenerBound) {
      window.addEventListener("popstate", handlePopState);
      listenerBound = true;
    }
    scheduleReconcile();

    return () => {
      const idx = dismissStack.indexOf(dismiss);
      if (idx !== -1) dismissStack.splice(idx, 1);
      scheduleReconcile();
    };
  }, [active]);
}
