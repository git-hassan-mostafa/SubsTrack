import type { DbTenant } from '@/src/core/types/db';

export interface IAllowanceRepository {
  lowerAllowance(newAllowance: number): Promise<DbTenant>;
}
