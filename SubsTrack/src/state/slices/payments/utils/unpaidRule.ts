import type { UnpaidStartRule } from "@/src/core/types";
// Deep imports (not the module barrel) — the barrel re-exports screens, which
// would make the state layer pull in UI and risk an import cycle.
import tenantSettingService from "@/src/modules/admin/tenant-settings/services/TenantSettingService";
import { TENANT_SETTING_KEYS } from "@/src/modules/admin/tenant-settings/utils/constants";
import type { GlobalState } from "@/src/state/globalStore";

/**
 * The tenant's unpaid rule, read cross-slice at call time (never cached) so a
 * change in Tenant Settings takes effect on the very next status computation.
 */
export const getUnpaidRule = (get: () => GlobalState): UnpaidStartRule =>
  tenantSettingService.parseUnpaidStartRule(
    get().tenantSettings.items.find(
      (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
    )?.value,
  );
