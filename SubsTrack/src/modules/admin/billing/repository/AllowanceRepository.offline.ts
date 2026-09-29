import type { DbTenant } from "@shared/core/types/db";
import { isOnline } from "@/src/core/offline/net/connectivity";
import { RequiresConnectionError } from "@shared/core/errors/offlineErrors";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";
import type { IAllowanceRepository } from "@shared/modules/admin/billing/repository/IAllowanceRepository";
import { AllowanceRepository } from "@shared/modules/admin/billing/repository/AllowanceRepository";

// Online-only: the floors are the server's live active counts, which a mirror
// that has not synced cannot answer — see docs/offline.md.
export class OfflineAllowanceRepository implements IAllowanceRepository {
  private online = new AllowanceRepository();

  async lowerAllowances(next: QuotaPair): Promise<DbTenant> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.lowerAllowances(next);
  }
}
