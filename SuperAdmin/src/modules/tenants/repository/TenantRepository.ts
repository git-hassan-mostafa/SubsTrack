import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbTenant } from "@/src/core/types/db";

export class TenantRepository extends BaseRepository {
  async findAll(): Promise<DbTenant[]> {
    const { data, error } = await this.db
      .from("tenants")
      .select("*")
      .order("name");
    if (error) this.handleError(error);
    return (data ?? []) as DbTenant[];
  }

  async create(
    payload: Pick<DbTenant, "name" | "tenant_code">,
  ): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .insert(payload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }

  async update(
    id: string,
    payload: Partial<Pick<DbTenant, "name" | "active">>,
  ): Promise<DbTenant> {
    const { data, error } = await this.db
      .from("tenants")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) this.handleError(error);
    return data as DbTenant;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from("tenants").delete().eq("id", id);
    if (error) this.handleError(error);
  }
}
