import type { DbTenant } from '@/src/core/types/db';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { IAllowanceRepository } from './IAllowanceRepository';
import { AllowanceRepository } from './AllowanceRepository';

// Online-only: the floor is the server's live active-customer count, which a
// mirror that has not synced cannot answer — see docs/offline.md.
export class OfflineAllowanceRepository implements IAllowanceRepository {
  private online = new AllowanceRepository();

  async lowerAllowance(newAllowance: number): Promise<DbTenant> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.lowerAllowance(newAllowance);
  }
}
