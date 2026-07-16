import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { CreateTenantInput, CreateTenantResult } from '../utils/types';
import type { ISignupRepository } from './ISignupRepository';
import { SignupRepository } from './SignupRepository';

/**
 * Offline Signup repository. Signup has no local tables — both methods hit the
 * network (tenant-code RPC + create-tenant edge function), so this is a thin
 * wrapper that requires connectivity and delegates to the Supabase sibling.
 * It does NOT extend OfflineBaseRepository (no local DB involved).
 */
export class OfflineSignupRepository implements ISignupRepository {
  private online = new SignupRepository();

  async isTenantCodeAvailable(code: string): Promise<boolean> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.isTenantCodeAvailable(code);
  }

  async createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.createTenant(input);
  }
}
