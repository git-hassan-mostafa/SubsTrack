import type { BranchFilter } from '@/src/core/constants';
import type { DbSale } from '@/src/core/types/db';
import type { FindSalesOptions } from '../utils/types';

export type CreateSalePayload = Omit<
  DbSale,
  'id' | 'total_amount' | 'created_at' | 'updated_at' | 'voided_at' | 'voided_by' | 'void_reason' | 'products' | 'customers'
>;

export interface ISaleRepository {
  findAll(opts?: FindSalesOptions): Promise<DbSale[]>;
  findByCustomer(customerId: string, limit?: number): Promise<DbSale[]>;
  findById(id: string): Promise<DbSale | null>;
  create(payload: CreateSalePayload): Promise<DbSale>;
  voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale>;
  totalsForMonth(
    monthStart: string,
    monthEndExclusive: string,
    branchFilter?: BranchFilter,
  ): Promise<{ amount: number; ratePerUsdSnapshot: number }[]>;
}
