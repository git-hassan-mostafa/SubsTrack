import type { BranchFilter } from "@shared/core/constants";
import type { Page } from "@shared/core/types";
import type { DbService } from "@shared/core/types/db";
import type { ServicePageQuery } from "@shared/modules/admin/service-catalog/utils/types";

// The products contract minus the stock ledger: labour is never stocked.
export interface IServiceRepository {
  findAll(branchFilter?: BranchFilter): Promise<DbService[]>;
  findPage(query: ServicePageQuery): Promise<Page<DbService>>;
  create(
    payload: Omit<DbService, "id" | "created_at" | "updated_at">,
  ): Promise<DbService>;
  update(
    id: string,
    payload: Partial<
      Pick<
        DbService,
        | "name"
        | "description"
        | "price"
        | "currency_id"
        | "branch_id"
        | "active"
      >
    >,
  ): Promise<DbService>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countAll(branchFilter?: BranchFilter): Promise<number>;
  countReferences(id: string): Promise<number>;
}
