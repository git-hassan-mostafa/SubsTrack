import type { CreateTenantInput, CreateTenantResult } from '../utils/types';

/**
 * The Signup repository contract. Both the Supabase (online/web) class and the
 * offline wrapper implement this — the compiler keeps the two in lockstep.
 * Both methods hit the network (tenant-code RPC + create-tenant edge function),
 * so the offline wrapper has nothing to do but require connectivity.
 */
export interface ISignupRepository {
  isTenantCodeAvailable(code: string): Promise<boolean>;
  createTenant(input: CreateTenantInput): Promise<CreateTenantResult>;
}
