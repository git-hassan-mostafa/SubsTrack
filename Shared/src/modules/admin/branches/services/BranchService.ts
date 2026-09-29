import { repositories } from "@shared/core/runtime/repositories";
import type { Branch } from "@shared/core/types";
import i18n from "@shared/core/i18n";
import { mapDbBranchToBranch } from "@shared/modules/admin/branches/utils/mapper";
import { BranchInput } from "@shared/modules/admin/branches/utils/types";

class BranchService {
  async getBranches(): Promise<Branch[]> {
    const rows = await repositories().branch.findAll();
    return rows.map(mapDbBranchToBranch);
  }

  async createBranch(data: BranchInput, tenantId: string): Promise<Branch> {
    const normalized = this.validate(data);
    try {
      const row = await repositories().branch.create({
        tenant_id: tenantId,
        name: normalized.name,
        active: true,
      });
      return mapDbBranchToBranch(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateBranch(id: string, data: BranchInput): Promise<Branch> {
    const normalized = this.validate(data);
    try {
      const row = await repositories().branch.update(id, { name: normalized.name });
      return mapDbBranchToBranch(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deleteBranch(id: string): Promise<"hard" | "soft"> {
    const activeCount = await repositories().branch.countActive();
    if (activeCount <= 1) {
      throw new Error(i18n.t("errors.branch_last_active"));
    }
    const refs = await repositories().branch.countReferences(id);
    if (refs > 0) {
      await repositories().branch.update(id, { active: false });
      return "soft";
    }
    await repositories().branch.delete(id);
    return "hard";
  }

  async reactivateBranch(id: string): Promise<Branch> {
    const row = await repositories().branch.update(id, { active: true });
    return mapDbBranchToBranch(row);
  }

  async deleteManyBranches(
    ids: string[],
  ): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const [activeCount, activeSelected] = await Promise.all([
      repositories().branch.countActive(),
      repositories().branch.countActiveAmong(ids),
    ]);
    if (activeCount - activeSelected < 1) {
      throw new Error(i18n.t("errors.branch_last_active"));
    }
    const referenced = await repositories().branch.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repositories().branch.deactivateMany(soft),
      repositories().branch.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  private validate(data: BranchInput): BranchInput {
    const name = (data.name ?? "").trim();
    if (!name) throw new Error(i18n.t("errors.branch_name_required"));
    if (name.length > 60)
      throw new Error(i18n.t("errors.branch_name_too_long"));
    return { name };
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("uq_branches_name_tenant") || msg.includes("duplicate")) {
      throw new Error(i18n.t("errors.branch_name_exists"));
    }
    throw err instanceof Error
      ? err
      : new Error(i18n.t("errors.connection_error"));
  }
}

export default new BranchService();
