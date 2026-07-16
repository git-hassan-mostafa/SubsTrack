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
 * How it works: we keep a LIFO stack of open modals and maintain a single
 * throwaway history entry (a "sentinel") — present iff at least one modal is
 * open. A user Back press pops the sentinel; we turn that into "dismiss the
 * topmost modal" and, if more remain, re-arm the sentinel so the next Back
 * dismisses the next one. Closing any other way (Cancel / Save / unmount)
 * removes the sentinel with our own `history.back()`.
 *
 * Why a single sentinel + per-tick reconcile (not one entry per modal): a
 * modal handoff — one modal closing while another opens/closes in the same tick
 * (menu → delete-confirm, confirm → close-parent-sheet) — used to fire a
 * `history.back()` (async) that overlapped a sibling's `pushState`/`back()`,
 * and the browser popped one step too many, exiting the route. Reconciling the
 * stack ⇄ history once per tick means such a handoff nets to "still open" and
 * touches history not at all, so `back()` and `pushState` never interleave.
 */
const isWeb = Platform.OS === "web";

interface ModalEntry {
  dismiss: () => void;
}

// LIFO stack of open modals — one entry per open modal.
const dismissStack: ModalEntry[] = [];
let listenerBound = false;

// Invariant: exactly ONE history sentinel exists iff `dismissStack` is
// non-empty. `sentinelActive` tracks whether we currently hold that entry.
let sentinelActive = false;
// Number of self-initiated `history.back()` calls still awaiting their
// popstate (so we ignore them). A counter — not a boolean — so overlapping
// closes can never let a self-pop masquerade as a genuine user Back.
let selfPops = 0;
let reconcileScheduled = false;

function pushSentinel() {
  sentinelActive = true;
  window.history.pushState({ __modal: true }, "");
}

function popSentinel() {
  sentinelActive = false;
  selfPops += 1;
  window.history.back();
}

// Bring history in line with the stack once per tick. Coalescing across a tick
// is what makes a handoff safe: if a modal closes and another opens in the same
// tick the stack stays non-empty, so the sentinel just stays put.
function scheduleReconcile() {
  if (reconcileScheduled) return;
  reconcileScheduled = true;
  queueMicrotask(() => {
    reconcileScheduled = false;
    const shouldHave = dismissStack.length > 0;
    if (shouldHave && !sentinelActive) pushSentinel();
    else if (!shouldHave && sentinelActive) popSentinel();
  });
}

function handlePopState() {
  // Our own back() (removing the sentinel on close) — swallow it.
  if (selfPops > 0) {
    selfPops -= 1;
    return;
  }
  // Genuine user Back: the browser consumed our sentinel.
  sentinelActive = false;
  const top = dismissStack.pop();
  if (top) top.dismiss();
  // More modals still open → re-arm a sentinel so the next Back dismisses the
  // next one down.
  if (dismissStack.length > 0) pushSentinel();
}

export function useWebBackDismiss(active: boolean, onDismiss: () => void) {
  // Keep the latest callback without re-running the effect (which would churn
  // the stack). Only `active` drives the open/close lifecycle.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isWeb || !active) return;

    const entry: ModalEntry = { dismiss: () => onDismissRef.current() };
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
