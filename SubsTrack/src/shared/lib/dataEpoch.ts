let epoch = 0;

/** Capture before an await; a load gone stale must never be stored. */
export function currentDataEpoch(): number {
  return epoch;
}

/** Invalidates every in-flight load — see gotcha #155. */
export function bumpDataEpoch(): void {
  epoch += 1;
}

/** True once the session or tenant that started the load has gone. */
export function isStaleEpoch(captured: number): boolean {
  return captured !== epoch;
}
