import type { Service } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/ServiceRepository';
import { mapDbServiceToService } from '../utils/mapper';
import { ServiceInput } from '../utils/types';

/**
 * Business logic for the service price list — the twin of ProductService, minus
 * every stock and cost concern.
 *
 * Named ServiceCatalogService, not ServiceService: "service" is also this app's
 * name for the business-logic layer itself, so the symmetric name would read as
 * the layer rather than the thing. There is NO tier gate here — services are
 * uncapped, unlike products (`max_products`).
 */
class ServiceCatalogService {
  async getServices(branchFilter: BranchFilter = null): Promise<Service[]> {
    const rows = await repository.findAll(branchFilter);
    return rows.map(mapDbServiceToService);
  }

  async createService(data: ServiceInput, tenantId: string): Promise<Service> {
    this.validate(data);
    try {
      const row = await repository.create({
        tenant_id: tenantId,
        branch_id: data.branchId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        active: true,
      });
      return mapDbServiceToService(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateService(id: string, data: ServiceInput): Promise<Service> {
    this.validate(data);
    try {
      const row = await repository.update(id, {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        branch_id: data.branchId,
      });
      return mapDbServiceToService(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async deleteService(id: string): Promise<'hard' | 'soft'> {
    const refs = await repository.countReferences(id);
    if (refs > 0) {
      await repository.update(id, { active: false });
      return 'soft';
    }
    await repository.delete(id);
    return 'hard';
  }

  async reactivateService(id: string): Promise<Service> {
    const row = await repository.update(id, { active: true });
    return mapDbServiceToService(row);
  }

  async deleteManyServices(ids: string[]): Promise<{ hard: string[]; soft: string[] }> {
    if (ids.length === 0) return { hard: [], soft: [] };
    const referenced = await repository.referencedIds(ids);
    const soft = ids.filter((id) => referenced.has(id));
    const hard = ids.filter((id) => !referenced.has(id));
    await Promise.all([
      repository.deactivateMany(soft),
      repository.deleteMany(hard),
    ]);
    return { hard, soft };
  }

  private validate(data: ServiceInput): void {
    if (!data.name?.trim()) throw new Error(i18n.t('errors.service_name_required'));
    if (typeof data.price !== 'number' || Number.isNaN(data.price)) {
      throw new Error(i18n.t('errors.service_price_required'));
    }
    if (data.price <= 0) throw new Error(i18n.t('errors.service_price_positive'));
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_services_name_tenant_branch') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.service_name_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}

export default new ServiceCatalogService()
