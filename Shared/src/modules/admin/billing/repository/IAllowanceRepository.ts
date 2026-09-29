import type { DbTenant } from "@shared/core/types/db";
import type { QuotaPair } from "../utils/types";

export interface IAllowanceRepository {
  lowerAllowances(next: QuotaPair): Promise<DbTenant>;
}
