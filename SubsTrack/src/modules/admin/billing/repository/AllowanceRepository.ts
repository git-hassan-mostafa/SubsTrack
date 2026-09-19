import { Platform } from "react-native";
import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTenant } from "@/src/core/types/db";
import type { QuotaPair } from "../utils/types";
import type { IAllowanceRepository } from "./IAllowanceRepository";
import { OfflineAllowanceRepository } from "./AllowanceRepository.offline";

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

const impl: IAllowanceRepository =
  Platform.OS === "web"
    ? new AllowanceRepository()
    : new OfflineAllowanceRepository();

export default impl;
