import { repositories } from "@shared/core/runtime/repositories";
import type {
  TenantSetting,
  UnpaidStartRule,
  WhatsAppLanguage,
} from "@shared/core/types";
import { mapDbTenantSettingToTenantSetting } from "@shared/modules/admin/tenant-settings/utils/mapper";
import {
  DEFAULT_UNPAID_START_RULE,
  DEFAULT_WHATSAPP_LANGUAGE,
  TENANT_SETTING_KEYS,
} from "@shared/modules/admin/tenant-settings/utils/constants";

export { DEFAULT_UNPAID_START_RULE };

const UNPAID_START_RULES: UnpaidStartRule[] = [
  "month_start",
  "customer_start_day",
];

const WHATSAPP_LANGUAGES: WhatsAppLanguage[] = ["en", "ar"];

/**
 * Business layer over the per-tenant `tenant_settings` table. Owns the parsing
 * of raw string values into typed settings, so no caller has to know the
 * storage format.
 */
class TenantSettingService {
  async getSettings(): Promise<TenantSetting[]> {
    const rows = await repositories().tenantSetting.findAll();
    return rows.map(mapDbTenantSettingToTenantSetting);
  }

  async setUnpaidStartRule(
    tenantId: string,
    rule: UnpaidStartRule,
  ): Promise<TenantSetting> {
    if (!UNPAID_START_RULES.includes(rule)) {
      throw new Error(`Unknown unpaid start rule: ${rule}`);
    }
    const row = await repositories().tenantSetting.upsert(
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
    const row = await repositories().tenantSetting.upsert(
      tenantId,
      TENANT_SETTING_KEYS.displayCurrencyId,
      currencyId,
    );
    return mapDbTenantSettingToTenantSetting(row);
  }

  async setWhatsAppLanguage(
    tenantId: string,
    language: WhatsAppLanguage,
  ): Promise<TenantSetting> {
    if (!WHATSAPP_LANGUAGES.includes(language)) {
      throw new Error(`Unknown WhatsApp language: ${language}`);
    }
    const row = await repositories().tenantSetting.upsert(
      tenantId,
      TENANT_SETTING_KEYS.whatsAppLanguage,
      language,
    );
    return mapDbTenantSettingToTenantSetting(row);
  }

  parseWhatsAppLanguage(value: string | null | undefined): WhatsAppLanguage {
    const v = value?.trim() as WhatsAppLanguage | undefined;
    return v && WHATSAPP_LANGUAGES.includes(v) ? v : DEFAULT_WHATSAPP_LANGUAGE;
  }

  parseUnpaidStartRule(value: string | null | undefined): UnpaidStartRule {
    const v = value?.trim() as UnpaidStartRule | undefined;
    return v && UNPAID_START_RULES.includes(v) ? v : DEFAULT_UNPAID_START_RULE;
  }

  parseDisplayCurrencyId(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }
}

export default new TenantSettingService();
