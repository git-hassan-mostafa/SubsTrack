import type { AppOption } from "@shared/core/types";

// Keys match case-insensitively: the owner types them by hand.
export function optionValue(options: AppOption[], key: string): string | null {
  return options.find((o) => o.key.toLowerCase() === key.toLowerCase())?.value ?? null;
}
