import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Web-only: make the browser **Back** button close an open modal (sheet,
 * dialog, or picker) instead of navigating the route — mirroring Android's
 * hardware-back → `onRequestClose`.
 *
 * On native this is a no-op: RN's `Modal` already routes hardware back to
 * `onRequestClose`. On web, RN-Web's `Modal` ignores browser history entirely,
 * so without this the Back button falls through to Expo Router and pops the
 * route.
 *
 * How it works: when the modal opens we push a throwaway history entry. The
 * next Back press pops *that* entry (staying on the same route) and fires a
 * `popstate`, which we turn into `onDismiss`. Closing any other way (Cancel /
 * Save) pops our entry back off so history stays balanced.
 *
 * Nested modals (a picker or dialog opened on top of a form sheet) are handled
 * via a shared LIFO stack + a single `popstate` listener: one Back press only
 * dismisses the topmost open modal.
 */
const isWeb = Platform.OS === "web";

// LIFO stack of "dismiss the topmost modal" callbacks — one entry per open
// modal. A single popstate listener drives only the top one.
const dismissStack: Array<() => void> = [];
let listenerBound = false;
// Set right before we call history.back() ourselves (balancing an entry on
// close-via-button) so the resulting popstate isn't mistaken for a user Back.
let ignoreNextPop = false;

function handlePopState() {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  const top = dismissStack[dismissStack.length - 1];
  if (top) top();
}

export function useWebBackDismiss(active: boolean, onDismiss: () => void) {
  // Keep the latest callback without re-running the effect (which would push a
  // new history entry). Only `active` drives the open/close lifecycle.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isWeb || !active) return;

    let consumedByBack = false;
    const entry = () => {
      consumedByBack = true; // browser already popped our entry
      const idx = dismissStack.indexOf(entry);
      if (idx !== -1) dismissStack.splice(idx, 1);
      onDismissRef.current();
    };

    dismissStack.push(entry);
    if (!listenerBound) {
      window.addEventListener("popstate", handlePopState);
      listenerBound = true;
    }
    window.history.pushState({ __modal: true }, "");

    return () => {
      const idx = dismissStack.indexOf(entry);
      if (idx !== -1) dismissStack.splice(idx, 1);
      // Closed by something other than Back (Cancel / Save / unmount) → remove
      // the entry we pushed, ignoring the popstate it triggers.
      if (!consumedByBack) {
        ignoreNextPop = true;
        window.history.back();
      }
    };
  }, [active]);
}
