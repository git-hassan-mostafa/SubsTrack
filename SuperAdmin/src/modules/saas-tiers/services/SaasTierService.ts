import type { SaasTier } from '@/src/core/types';
import type { DbSaasTier } from '@/src/core/types/db';
import { SaasTierRepository } from '../repository/SaasTierRepository';

function mapDbSaasTierToSaasTier(db: DbSaasTier): SaasTier {
  return {
    id: db.id,
    name: db.name,
    maxUsers: db.max_users,
    maxCustomers: db.max_customers,
    price: db.price,
    graceDays: db.grace_days,
    tenantId: db.tenant_id,
    createdAt: db.created_at,
  };
}

export interface SaasTierInput {
  name: string;
  maxUsers: number;
  maxCustomers: number;
  price: number;
  graceDays: number;
  tenantId?: string;
}

export class SaasTierService {
  private repository = new SaasTierRepository();

  async getSaasTiers(): Promise<SaasTier[]> {
    const rows = await this.repository.findAll();
    return rows.map(mapDbSaasTierToSaasTier);
  }

  async createSaasTier(data: SaasTierInput & { tenantId: string }): Promise<SaasTier> {
    this.validate(data);
    try {
      const row = await this.repository.create({
        name: data.name.trim(),
        max_users: data.maxUsers,
        max_customers: data.maxCustomers,
        price: data.price,
        grace_days: data.graceDays,
        tenant_id: data.tenantId,
      });
      return mapDbSaasTierToSaasTier(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateSaasTier(id: string, data: SaasTierInput): Promise<SaasTier> {
    this.validate(data);
    try {
      const row = await this.repository.update(id, {
        name: data.name.trim(),
        max_users: data.maxUsers,
        max_customers: data.maxCustomers,
        price: data.price,
        grace_days: data.graceDays,
      });
      return mapDbSaasTierToSaasTier(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deleteSaasTier(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  private validate(data: SaasTierInput): void {
    if (!data.name.trim()) throw new Error('Tier name is required');
    if (!Number.isInteger(data.maxUsers) || data.maxUsers <= 0)
      throw new Error('Max users must be a positive integer');
    if (!Number.isInteger(data.maxCustomers) || data.maxCustomers <= 0)
      throw new Error('Max customers must be a positive integer');
    if (isNaN(data.price) || data.price < 0)
      throw new Error('Price must be 0 or greater');
    if (!Number.isInteger(data.graceDays) || data.graceDays < 0)
      throw new Error('Grace days must be 0 or greater');
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_saas_tiers') || msg.includes('unique') || msg.includes('duplicate')) {
      throw new Error('This tenant already has a SaaS tier assigned');
    }
    throw err instanceof Error ? err : new Error('Connection error. Please try again.');
  }
}
