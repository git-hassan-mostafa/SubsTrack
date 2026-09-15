import { useCallback, useEffect, useRef } from "react";

const FIRST_DELAY_MS = 400;
const REPEAT_MS = 80;
const ACCELERATE_AFTER = 10;
const FAST_REPEAT_MS = 30;

interface HoldRepeat {
  onLongPress: () => void;
  onPressOut: () => void;
  delayLongPress: number;
}

/** Gap before the next repeat: steady at first, faster once the hold persists. */
export function repeatDelayAfter(ticks: number): number {
  return ticks > ACCELERATE_AFTER ? FAST_REPEAT_MS : REPEAT_MS;
}

/** Hold a stepper button to keep stepping; speeds up once the hold is clearly deliberate. */
export function useHoldRepeat(step: () => void): HoldRepeat {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticks = useRef(0);
  // The latest step closure, so a repeat never fires a stale bound value.
  // Written in an effect, never during render — reactCompiler is on.
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ticks.current = 0;
  }, []);

  // A repeating setTimeout rather than setInterval: the delay itself changes
  // as the hold goes on, and a missed tick must not queue up behind others.
  const tick = useCallback(() => {
    latest.current();
    ticks.current += 1;
    timer.current = setTimeout(tick, repeatDelayAfter(ticks.current));
  }, []);

  useEffect(() => stop, [stop]);

  return {
    onLongPress: tick,
    onPressOut: stop,
    delayLongPress: FIRST_DELAY_MS,
  };
}
