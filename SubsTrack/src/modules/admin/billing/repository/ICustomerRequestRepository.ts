import type { DbCustomerRequest } from '@/src/core/types/db';

export interface CustomerRequestInput {
  tenant_id: string;
  requested_count: number;
  requested_by: string | null;
}

export interface ICustomerRequestRepository {
  findLatest(tenantId: string): Promise<DbCustomerRequest | null>;
  create(payload: CustomerRequestInput): Promise<DbCustomerRequest>;
  updateCount(id: string, requestedCount: number): Promise<DbCustomerRequest>;
  cancel(id: string): Promise<DbCustomerRequest>;
}
