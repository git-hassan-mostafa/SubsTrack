import { runtime } from "@shared/core/runtime/runtime";

// Offline rows own their id up front, so replaying an upsert never doubles it.
export function newId(): string {
  return runtime().ids.randomUUID();
}

// The single source of "now" for client-set timestamps.
export function nowIso(): string {
  return new Date().toISOString();
}

// The start of a windowed table's local range.
export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// Same parts give the same id on every device, so offline month bills converge.
export async function deterministicId(...parts: string[]): Promise<string> {
  const hex = await runtime().ids.sha1Hex(parts.join(" "));
  const h = hex.slice(0, 32).padEnd(32, "0");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
