import type { Currency, TierPlan } from '@/src/core/types';
import type { DbCurrency } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { CurrencyRepository } from '../repository/CurrencyRepository';
import { tierService } from '@/src/modules/subscription/services/TierService';

function mapDbCurrencyToCurrency(db: DbCurrency): Currency {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    code: db.code,
    name: db.name,
    symbol: db.symbol,
    ratePerUsd: Number(db.rate_per_usd),
    decimals: db.decimals,
    active: db.active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export type CurrencyInput = {
  code: string;
  name: string;
  symbol: string | null;
  ratePerUsd: number;
  decimals: number;
};

export class CurrencyService {
  private repository = new CurrencyRepository();

  async getCurrencies(): Promise<Currency[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbCurrencyToCurrency);
  }

  async createCurrency(
    data: CurrencyInput,
    tenantId: string,
    tier: TierPlan,
  ): Promise<Currency> {
    tierService.assertMultiCurrency(tier);
    const normalized = this.validate(data);
    try {
      const row = await this.repository.create({
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
      const row = await this.repository.update(id, {
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

  // If the currency is referenced by any plan or payment, soft-delete it
  // (mark active = false). Otherwise hard-delete. Returns the deletion mode
  // so the UI can communicate the outcome.
  async deleteCurrency(id: string): Promise<'hard' | 'soft'> {
    const refs = await this.repository.countReferences(id);
    if (refs > 0) {
      await this.repository.update(id, { active: false });
      return 'soft';
    }
    await this.repository.delete(id);
    return 'hard';
  }

  async reactivateCurrency(id: string): Promise<Currency> {
    const row = await this.repository.update(id, { active: true });
    return mapDbCurrencyToCurrency(row);
  }

  private validate(data: CurrencyInput): CurrencyInput {
    const code = (data.code ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(code)) {
      throw new Error(i18n.t('errors.currency_code_invalid'));
    }
    if (code === 'USD') {
      throw new Error(i18n.t('errors.currency_usd_reserved'));
    }
    const name = (data.name ?? '').trim();
    if (!name) throw new Error(i18n.t('errors.currency_name_required'));
    const symbol = data.symbol?.trim() || null;
    if (typeof data.ratePerUsd !== 'number' || !Number.isFinite(data.ratePerUsd) || data.ratePerUsd <= 0) {
      throw new Error(i18n.t('errors.currency_rate_invalid'));
    }
    if (!Number.isInteger(data.decimals) || data.decimals < 0 || data.decimals > 6) {
      throw new Error(i18n.t('errors.currency_decimals_invalid'));
    }
    return { code, name, symbol, ratePerUsd: data.ratePerUsd, decimals: data.decimals };
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_currencies_code_tenant') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.currency_code_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}
