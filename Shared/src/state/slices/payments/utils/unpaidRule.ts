import type { UnpaidStartRule } from "@shared/core/types";
import { parseUnpaidStartRule } from "@shared/modules/admin/tenant-settings/utils/unpaidStartRule";
import { TENANT_SETTING_KEYS } from "@shared/modules/admin/tenant-settings/utils/constants";
import type { GlobalState } from "@shared/state/globalStore";

/**
 * The tenant's unpaid rule, read cross-slice at call time (never cached) so a
 * change in Tenant Settings takes effect on the very next status computation.
 */
export const getUnpaidRule = (get: () => GlobalState): UnpaidStartRule =>
  parseUnpaidStartRule(
    get().tenantSettings.items.find(
      (s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule,
    )?.value,
  );
