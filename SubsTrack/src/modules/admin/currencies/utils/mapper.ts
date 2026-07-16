import type { DbCurrency } from '@/src/core/types/db';
import type { Currency } from '@/src/core/types';

export function mapDbCurrencyToCurrency(db: DbCurrency): Currency {
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