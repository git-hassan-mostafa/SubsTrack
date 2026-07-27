import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Web-only: make the browser **Back** button close an open modal instead of
 * navigating the route. Native counterpart: `useAndroidBackDismiss` for sheets,
 * `onRequestClose` for the centered RN `Modal` dialogs.
 *
 * On native this is a no-op. On web, RN-Web's `Modal` ignores browser history
 * entirely (and Gorhom's sheets aren't `Modal`s at all), so without this the
 * Back button falls through to Expo Router and pops the route.
 *
 * SCOPE — every open surface: `AppBottomSheet` registers for BOTH variants (form
 * sheets AND the transient pickers / action menu), and the centered dialogs
 * (`ConfirmDialog`, `UpgradePromptModal`) call it directly, since a dialog must
 * trap Back too or Back would close the sheet *underneath* it and leave the
 * dialog floating. The popups used to be excluded to reduce history churn, but
 * that left Back falling through to the router whenever one was the top surface —
 * the route changed and the popup vanished with the screen. The per-modal
 * sentinel + per-tick reconcile below is what makes the churn safe.
 *
 * How it works: we keep a LIFO stack of open modals and mirror its depth in
 * browser history with one throwaway entry per open modal (a "sentinel"). A
 * user Back press pops the topmost sentinel; we turn that into "dismiss the
 * topmost modal". Because history always holds as many sentinels as there are
 * open modals, the next Back already has its own sentinel waiting — no re-arm
 * step is needed. Closing any other way (Cancel / Save / unmount) drops a
 * sentinel with our own `history.back()`.
 *
 * Why one sentinel PER modal (not a single re-armed one): with a single
 * sentinel, each Back consumed it and we had to `pushState` a fresh one from
 * inside the popstate handler. A second Back fired faster than that async
 * re-arm round-trip would navigate against a history with no sentinel left and
 * fall straight through to the route — closing the tab or jumping pages
 * (intermittent, timing-dependent). Keeping the sentinel COUNT equal to the
 * modal count means every Back, however fast, always has a sentinel to eat.
 *
 * Why still reconcile once per tick (not push/pop eagerly per mount): a modal
 * handoff — one modal closing while another opens/closes in the same tick
 * (menu → delete-confirm, confirm → close-parent-sheet) — would otherwise fire
 * a `history.back()` (async) that overlapped a sibling's `pushState`/`back()`,
 * and the browser popped one step too many, exiting the route. Coalescing the
 * stack ⇄ history diff into one reconcile per tick means such a handoff nets to
 * "same depth" and touches history not at all, so `back()` and `pushState`
 * never interleave.
 */
const isWeb = Platform.OS === "web";

interface ModalEntry {
  dismiss: () => void;
}

// LIFO stack of open modals — one entry per open modal.
const dismissStack: ModalEntry[] = [];
let listenerBound = false;

// Invariant: `sentinelCount` history sentinels exist, one per open modal — it
// tracks `dismissStack.length` (reconciled once per tick, see below).
let sentinelCount = 0;
// Number of self-initiated `history.back()` calls still awaiting their
// popstate (so we ignore them). A counter — not a boolean — so overlapping
// closes can never let a self-pop masquerade as a genuine user Back.
let selfPops = 0;
let reconcileScheduled = false;

function pushSentinel() {
  sentinelCount += 1;
  // Spread the CURRENT history state — Expo Router keeps its entry `id` there and
  // uses it to locate itself (`createMemoryHistory.index`). A sentinel with no id
  // makes the router read index 0, and any navigation-state change while a sheet
  // is open then hits `history.replace()`, which mints a NEW id, fails to find it,
  // and RESETS the router's in-memory history to a single entry. Back afterwards
  // resolved to the wrong record and the router reset the route on top of our
  // dismiss — the sheet closed AND the screen changed. Copying the id keeps the
  // sentinel invisible to the router.
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
  // Our own back() (removing a sentinel on close) — swallow it.
  if (selfPops > 0) {
    selfPops -= 1;
    return;
  }
  // Genuine user Back: the browser consumed the topmost sentinel. The next
  // Back already has its own sentinel below it, so nothing to re-arm here.
  if (sentinelCount > 0) sentinelCount -= 1;
  const top = dismissStack.pop();
  if (top) top.dismiss();
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
