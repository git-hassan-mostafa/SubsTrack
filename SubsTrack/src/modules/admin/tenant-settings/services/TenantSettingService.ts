import type { TenantSetting, UnpaidStartRule } from '@/src/core/types';
import repository from '../repository/TenantSettingRepository';
import { mapDbTenantSettingToTenantSetting } from '../utils/mapper';
import { TENANT_SETTING_KEYS } from '../utils/constants';

/** Behavior when the tenant has never set the option. Preserves the original app rule. */
export const DEFAULT_UNPAID_START_RULE: UnpaidStartRule = 'month_start';

const UNPAID_START_RULES: UnpaidStartRule[] = ['month_start', 'customer_start_day'];

/**
 * Business layer over the per-tenant `tenant_settings` table. Owns the parsing
 * of raw string values into typed settings, so no caller has to know the
 * storage format.
 */
class TenantSettingService {
  async getSettings(): Promise<TenantSetting[]> {
    const rows = await repository.findAll();
    return rows.map(mapDbTenantSettingToTenantSetting);
  }

  async setUnpaidStartRule(tenantId: string, rule: UnpaidStartRule): Promise<TenantSetting> {
    if (!UNPAID_START_RULES.includes(rule)) {
      throw new Error(`Unknown unpaid start rule: ${rule}`);
    }
    const row = await repository.upsert(
      tenantId,
      TENANT_SETTING_KEYS.unpaidStartRule,
      rule,
    );
    return mapDbTenantSettingToTenantSetting(row);
  }

  async setDisplayCurrencyId(
    tenantId: string,
    currencyId: string | null,
  ): Promise<TenantSetting> {
    const row = await repository.upsert(
      tenantId,
      TENANT_SETTING_KEYS.displayCurrencyId,
      currencyId,
    );
    return mapDbTenantSettingToTenantSetting(row);
  }

  /** Resolve the stored value to a valid rule; unknown/missing falls back to the default. */
  parseUnpaidStartRule(value: string | null | undefined): UnpaidStartRule {
    const v = value?.trim() as UnpaidStartRule | undefined;
    return v && UNPAID_START_RULES.includes(v) ? v : DEFAULT_UNPAID_START_RULE;
  }

  /** Currency id amounts are displayed in; blank/missing means USD (the base). */
  parseDisplayCurrencyId(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }
}

export default new TenantSettingService();
