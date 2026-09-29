export interface EchoDecision {
  adopt: boolean;
  pending: string[];
}

const PENDING_LIMIT = 8;

/** A value the field already sent up is a late echo, never a new instruction. */
export function resolveEcho(
  value: string,
  pending: readonly string[],
): EchoDecision {
  const at = pending.indexOf(value);
  if (at === -1) return { adopt: true, pending: [] };
  return { adopt: false, pending: pending.slice(at + 1) };
}

/** Queues what the owner is expected to send back, newest last. */
export function queueEcho(pending: readonly string[], echo: string): string[] {
  return [...pending, echo].slice(-PENDING_LIMIT);
}
