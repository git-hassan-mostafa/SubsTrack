import type { ExceptionInput } from "@shared/core/runtime/runtime";

export type ErrorDetails = Pick<ExceptionInput, "message" | "stack">;

const MAX_CAUSES = 5;
const KNOWN_FIELDS = new Set(["name", "message", "stack", "cause"]);

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === "object" && "message" in error) {
    return asText(error.message);
  }
  return error === undefined ? "Unknown error" : asText(error);
}

function extraFieldsOf(error: Error): string | null {
  const extra = Object.fromEntries(
    Object.entries(error).filter(([key]) => !KNOWN_FIELDS.has(key)),
  );
  return Object.keys(extra).length > 0 ? asText(extra) : null;
}

function traceOf(error: unknown): string {
  if (!(error instanceof Error)) return asText(error);
  const head = error.stack ?? `${error.name}: ${error.message}`;
  const extra = extraFieldsOf(error);
  return extra ? `${head}\n${extra}` : head;
}

// Anything thrown, even a string or a plain object, with its whole cause chain.
export function describeError(error: unknown): ErrorDetails {
  const traces: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSES && current !== undefined; depth++) {
    traces.push(depth === 0 ? traceOf(current) : `Caused by: ${traceOf(current)}`);
    current = current instanceof Error ? current.cause : undefined;
  }
  return { message: messageOf(error), stack: traces.join("\n\n") };
}
