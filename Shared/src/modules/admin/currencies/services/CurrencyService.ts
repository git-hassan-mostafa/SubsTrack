import { repositories } from "@shared/core/runtime/repositories";
import type { Currency, Page } from "@shared/core/types";
import i18n from "@shared/core/i18n";
import { mapDbCurrencyToCurrency } from "@shared/modules/admin/currencies/utils/mapper";
import type {
  CurrencyInput,
  CurrencyPageQuery,
} from "@shared/modules/admin/currencies/utils/types";

class CurrencyService {
  async getCurrencies(): Promise<Currency[]> {
    const rows = await repositories().currency.findAll();
    return rows.map(mapDbCurrencyToCurrency);
  }

  async getCurrencyPage(query: CurrencyPageQuery): Promise<Page<Currency>> {
    const page = await repositories().currency.findPage(query);
    return { rows: page.rows.map(mapDbCurrencyToCurrency), total: page.total };
  }

  async createCurrency(
    data: CurrencyInput,
    tenantId: string,
  ): Promise<Currency> {
    const normalized = this.validate(data);
    try {
      const row = await repositories().currency.create({
        tenant_id: tenantId,
        code: normalized.code,
        name: normalized.name,
        symbol: normalized.symbol,
        rate_per_usd: normalized.ratePerUsd,
        decimals: normalized.decimals,
        active: true,
      });
      return mapDbCurrencyToCurrency(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateCurrency(id: string, data: CurrencyInput): Promise<Currency> {
    const normalized = this.validate(data);
    try {
      const row = await repositories().currency.update(id, {
        code: normalized.code,
        name: normalized.name,
        symbol: normalized.symbol,
        rate_per_usd: normalized.ratePerUsd,
        decimals: normalized.decimals,
      });
      return mapDbCurrencyToCurrency(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deleteCurrency(id: string): Promise<"hard" | "soft"> {
    const refs = await repositories().currency.countReferences(id);
    if (refs > 0) {
      await repositories().currency.update(id, { active: false });
      return "soft";
    }
    await repositories().currency.delete(id);
    return "hard";
  }

  async deactivateCurrency(id: string): Promise<Currency> {
    const row = await repositories().currency.update(id, { active: false });
    return mapDbCurrencyToCurrency(row);
  }

  async reactivateCurrency(id: string): Promise<Currency> {
    const row = await repositories().currency.update(id, { active: true });
    return mapDbCurrencyToCurrency(row);
  }

  async deleteManyCurrencies(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const referenced = await repositories().currency.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repositories().currency.deactivateMany(soft),
      repositories().currency.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  private validate(data: CurrencyInput): CurrencyInput {
    const code = (data.code ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(code)) {
      throw new Error(i18n.t("errors.currency_code_invalid"));
    }
    if (code === "USD") {
      throw new Error(i18n.t("errors.currency_usd_reserved"));
    }
    const name = (data.name ?? "").trim();
    if (!name) throw new Error(i18n.t("errors.currency_name_required"));
    const symbol = data.symbol?.trim() || null;
    if (
      typeof data.ratePerUsd !== "number" ||
      !Number.isFinite(data.ratePerUsd) ||
      data.ratePerUsd <= 0
    ) {
      throw new Error(i18n.t("errors.currency_rate_invalid"));
    }
    if (
      !Number.isInteger(data.decimals) ||
      data.decimals < 0 ||
      data.decimals > 6
    ) {
      throw new Error(i18n.t("errors.currency_decimals_invalid"));
    }
    return {
      code,
      name,
      symbol,
      ratePerUsd: data.ratePerUsd,
      decimals: data.decimals,
    };
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg.includes("uq_currencies_code_tenant") ||
      msg.includes("duplicate")
    ) {
      throw new Error(i18n.t("errors.currency_code_exists"));
    }
    throw err instanceof Error
      ? err
      : new Error(i18n.t("errors.connection_error"));
  }
}

export default new CurrencyService();
