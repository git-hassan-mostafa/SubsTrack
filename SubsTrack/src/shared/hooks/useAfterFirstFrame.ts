import { useEffect, useState } from "react";

/**
 * Returns `false` while `active` has just become true, then `true` one frame
 * later. Flips back to `false` when `active` goes false, so a surface that opens
 * again defers again.
 *
 * Used to keep a heavy subtree off the critical path of an opening bottom sheet.
 * Gorhom can only start its slide-up animation once the sheet's container has
 * been laid out by native, and that layout event can't be dispatched while JS is
 * busy rendering. Rendering a whole form in the same commit therefore delays the
 * animation by however long the form takes — the sheet sits invisible, then
 * jumps. Deferring the body by one frame lets the sheet start moving first and
 * fills the content in while the animation runs on the UI thread.
 *
 * `requestAnimationFrame`, not a bare `useEffect`: passive effects can flush
 * before native has dispatched the layout event, which would put us right back
 * on the critical path.
 *
 * Pass the sheet's own visibility as `active`. Mount-on-open sheets can leave it
 * at the default; always-mounted ones must pass it, or the frame is spent at
 * screen mount and the deferral does nothing on the actual open.
 */
export function useAfterFirstFrame(active = true): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    const handle = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(handle);
  }, [active]);

  return ready;
}
