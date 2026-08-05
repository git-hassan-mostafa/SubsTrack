import { useGlobalStore } from '@/src/state/hooks/useGlobalStore';
import type { TenantSettingSlice } from '@/src/state/slices/tenantSettings/tenantSettingSlice';
import type { UnpaidStartRule } from '@/src/core/types';
import tenantSettingService from '@/src/modules/admin/tenant-settings/services/TenantSettingService';
import { TENANT_SETTING_KEYS } from '@/src/modules/admin/tenant-settings/utils/constants';

export function useTenantSettingSlice(): TenantSettingSlice;
export function useTenantSettingSlice<T>(selector: (state: TenantSettingSlice) => T): T;
export function useTenantSettingSlice<T = TenantSettingSlice>(
  selector?: (state: TenantSettingSlice) => T,
): T {
  return useGlobalStore((state) => {
    const slice = state.tenantSettings;
    return selector ? selector(slice) : (slice as T);
  });
}

// ---- Reusable per-tenant setting readers --------------------------------
// Values are stored as strings; these hooks are the single place that resolves
// a raw value to a typed setting, so call sites never parse it themselves.

/** Raw string value of a tenant setting, or `null` if unset. */
export const useTenantSettingValue = (key: string): string | null =>
  useTenantSettingSlice(
    (s) => s.items.find((x) => x.key.toLowerCase() === key.toLowerCase())?.value ?? null,
  );

/** The tenant's unpaid rule; falls back to the app default when unset. */
export const useUnpaidStartRule = (): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    useTenantSettingValue(TENANT_SETTING_KEYS.unpaidStartRule),
  );

/**
 * The currency amounts are displayed in — `null` = USD (the base).
 * Tenant-wide, not per device: every user of the organization sees the same one.
 */
export const useDisplayCurrencyId = (): string | null =>
  tenantSettingService.parseDisplayCurrencyId(
    useTenantSettingValue(TENANT_SETTING_KEYS.displayCurrencyId),
  );
