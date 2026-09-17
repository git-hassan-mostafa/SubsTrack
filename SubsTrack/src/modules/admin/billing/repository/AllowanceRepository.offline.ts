import type { DbTenant } from '@/src/core/types/db';
import { isOnline } from '@/src/core/offline/net/connectivity';
import { RequiresConnectionError } from '@/src/core/offline/errors';
import type { QuotaPair } from '../utils/types';
import type { IAllowanceRepository } from './IAllowanceRepository';
import { AllowanceRepository } from './AllowanceRepository';

// Online-only: the floors are the server's live active counts, which a mirror
// that has not synced cannot answer — see docs/offline.md.
export class OfflineAllowanceRepository implements IAllowanceRepository {
  private online = new AllowanceRepository();

  async lowerAllowances(next: QuotaPair): Promise<DbTenant> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.lowerAllowances(next);
  }
}
