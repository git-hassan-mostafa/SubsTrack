import type { TenantSetting } from "@shared/core/types";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";

// Only an explicit "false" turns tracking off; no row means the default, on.
export function parseTrackStock(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}

export function tracksStock(settings: TenantSetting[]): boolean {
  const key = TENANT_SETTING_KEYS.trackStock.toLowerCase();
  return parseTrackStock(
    settings.find((s) => s.key.toLowerCase() === key)?.value,
  );
}
