import { Platform } from "react-native";
import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTenant } from "@/src/core/types/db";
import type { IAllowanceRepository } from "./IAllowanceRepository";
import { OfflineAllowanceRepository } from "./AllowanceRepository.offline";

export class AllowanceRepository
  extends BaseRepository
  implements IAllowanceRepository
{
  // An RPC because tenants has no UPDATE policy and trg_tenants_guard_billing
  // blocks the column; the active-customer floor is re-counted server-side.
  async lowerAllowance(newAllowance: number): Promise<DbTenant> {
    const { data, error } = await this.db.rpc("lower_customer_allowance", {
      p_new_allowance: newAllowance,
    });
    if (error) this.handleError(error);
    return data as DbTenant;
  }
}

const impl: IAllowanceRepository =
  Platform.OS === 'web'
    ? new AllowanceRepository()
    : new OfflineAllowanceRepository();

export default impl;
