import type { Page } from "@shared/core/types";
import type { DbCurrency } from "@shared/core/types/db";
import type { CurrencyPageQuery } from "@shared/modules/admin/currencies/utils/types";

// Both the Supabase and the offline SQLite class implement this contract.
export interface ICurrencyRepository {
  findAll(): Promise<DbCurrency[]>;
  findPage(query: CurrencyPageQuery): Promise<Page<DbCurrency>>;
  create(
    payload: Omit<DbCurrency, "id" | "created_at" | "updated_at">,
  ): Promise<DbCurrency>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbCurrency,
        "code" | "name" | "symbol" | "rate_per_usd" | "decimals" | "active"
      >
    >,
  ): Promise<DbCurrency>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countReferences(id: string): Promise<number>;
}
