import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { OptionSlice } from '@/src/state/slices/options/optionSlice';
import { OPTION_KEYS } from '@/src/modules/options';

export function useOptionSlice(): OptionSlice;
export function useOptionSlice<T>(selector: (state: OptionSlice) => T): T;
export function useOptionSlice<T = OptionSlice>(
  selector?: (state: OptionSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.options;
    return selector ? selector(slice) : (slice as T);
  });
}

// ---- Reusable global-option readers -------------------------------------
// All option values are stored as strings in app_options. These small hooks
// are the single place that resolves a raw value (and parses booleans), so
// call sites read a typed, semantic flag instead of poking at `items`.

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value.trim().toLowerCase() === 'true';
}

/** Raw string value of a global option, or `null` if the row is absent. */
export const useOptionValue = (key: string): string | null =>
  useOptionSlice((s) => s.items.find((o) => o.key.toLowerCase() === key.toLowerCase())?.value ?? null);

/** A boolean global option. Missing/blank rows fall back to `fallback`. */
export const useBooleanOption = (key: string, fallback = false): boolean =>
  parseBool(useOptionValue(key), fallback);

// Semantic flag hooks — defaults preserve existing behavior when the SaaS
// owner has not configured the option yet.
export const useCanUpgradePlan = (): boolean =>
  useBooleanOption(OPTION_KEYS.allowPlanUpgrade, false);

export const useSelfServiceSignupEnabled = (): boolean =>
  useBooleanOption(OPTION_KEYS.allowSelfServiceSignup, false);

export const useSupportWhatsAppNumber = (): string | null =>
  useOptionValue(OPTION_KEYS.supportWhatsAppNumber);
