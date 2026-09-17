import type { DbCustomerRequest } from '@/src/core/types/db';
import type { QuotaPair } from '../utils/types';

export interface CustomerRequestInput {
  tenant_id: string;
  requested_count: number;
  requested_plans: number;
  requested_by: string | null;
}

export interface ICustomerRequestRepository {
  findLatest(tenantId: string): Promise<DbCustomerRequest | null>;
  create(payload: CustomerRequestInput): Promise<DbCustomerRequest>;
  updateCounts(id: string, extra: QuotaPair): Promise<DbCustomerRequest>;
  cancel(id: string): Promise<DbCustomerRequest>;
}
