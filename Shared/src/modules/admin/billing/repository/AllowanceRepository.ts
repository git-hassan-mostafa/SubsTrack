import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbTenant } from "@shared/core/types/db";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";
import type { IAllowanceRepository } from "@shared/modules/admin/billing/repository/IAllowanceRepository";

export class AllowanceRepository
  extends BaseRepository
  implements IAllowanceRepository
{
  // An RPC because tenants has no UPDATE policy and trg_tenants_guard_billing
  // blocks both columns; the active floors are re-counted server-side.
  async lowerAllowances(next: QuotaPair): Promise<DbTenant> {
    const { data, error } = await this.db.rpc("lower_allowances", {
      p_customer_allowance: next.customers,
      p_plan_allowance: next.plans,
    });
    if (error) this.handleError(error);
    return data as DbTenant;
  }
}
