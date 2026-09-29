import type { Page } from "@shared/core/types";
import type { DbBranch } from "@shared/core/types/db";
import type { BranchPageQuery } from "@shared/modules/admin/branches/utils/types";

// Both the Supabase and the offline SQLite class implement this contract.
export interface IBranchRepository {
  findAll(): Promise<DbBranch[]>;
  findPage(query: BranchPageQuery): Promise<Page<DbBranch>>;
  create(
    payload: Omit<DbBranch, "id" | "created_at" | "updated_at">,
  ): Promise<DbBranch>;
  update(
    id: string,
    payload: Partial<Pick<DbBranch, "name" | "active">>,
  ): Promise<DbBranch>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  deactivateMany(ids: string[]): Promise<void>;
  referencedIds(ids: string[]): Promise<Set<string>>;
  countActive(): Promise<number>;
  countActiveAmong(ids: string[]): Promise<number>;
  countReferences(id: string): Promise<number>;
}
