import type { Currency, TierPlan } from '@/src/core/types';
import i18n from '@/src/core/i18n';
import repository from '../repository/CurrencyRepository';
import { tierService } from '@/src/modules/admin/subscription';
import { mapDbCurrencyToCurrency } from '../utils/mapper';
import { CurrencyInput } from '../utils/types';



class CurrencyService {
  async getCurrencies(): Promise<Currency[]> {
    const rows = await repository.findAll();
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
      const row = await repository.create({
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
      const row = await repository.update(id, {
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
    const refs = await repository.countReferences(id);
    if (refs > 0) {
      await repository.update(id, { active: false });
      return 'soft';
    }
    await repository.delete(id);
    return 'hard';
  }

  async reactivateCurrency(id: string): Promise<Currency> {
    const row = await repository.update(id, { active: true });
    return mapDbCurrencyToCurrency(row);
  }

  // Batch counterpart to deleteCurrency: currencies used by a plan or payment
  // are soft-deleted, the rest hard-deleted — each group in a single statement.
  async deleteManyCurrencies(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const referenced = await repository.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repository.deactivateMany(soft),
      repository.deleteMany(hard),
    ]);
    return { hard, soft };
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

export default new CurrencyService()
