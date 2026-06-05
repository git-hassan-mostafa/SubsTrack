import type { Product, TierPlan, TenantUsage } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import type { DbProduct } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import { ProductRepository } from '../repository/ProductRepository';
import { tierService } from '@/src/modules/subscription/services/TierService';

export function mapDbProductToProduct(db: DbProduct): Product {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    branchId: db.branch_id,
    name: db.name,
    description: db.description,
    price: Number(db.price),
    currencyId: db.currency_id,
    active: db.active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export type ProductInput = Pick<Product, 'name' | 'description' | 'price' | 'currencyId' | 'branchId'>;

export class ProductService {
  private repository = new ProductRepository();

  async getProducts(branchFilter: BranchFilter = null): Promise<Product[]> {
    const rows = await this.repository.findAll(branchFilter);
    return rows.map(mapDbProductToProduct);
  }

  async createProduct(
    data: ProductInput,
    tenantId: string,
    tier: TierPlan,
    usage: TenantUsage,
  ): Promise<Product> {
    this.validate(data);
    tierService.assertCanCreate(tier, usage, 'products');
    try {
      const row = await this.repository.create({
        tenant_id: tenantId,
        branch_id: data.branchId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        active: true,
      });
      return mapDbProductToProduct(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  async updateProduct(id: string, data: ProductInput): Promise<Product> {
    this.validate(data);
    try {
      const row = await this.repository.update(id, {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        price: data.price,
        currency_id: data.currencyId,
        branch_id: data.branchId,
      });
      return mapDbProductToProduct(row);
    } catch (err) {
      return this.rethrow(err);
    }
  }

  // Soft-delete if any sales reference the product (preserves history); otherwise hard-delete.
  // Returns the mode so the UI can communicate the outcome — mirrors CurrencyService.deleteCurrency.
  async deleteProduct(id: string): Promise<'hard' | 'soft'> {
    const refs = await this.repository.countReferences(id);
    if (refs > 0) {
      await this.repository.update(id, { active: false });
      return 'soft';
    }
    await this.repository.delete(id);
    return 'hard';
  }

  async reactivateProduct(id: string): Promise<Product> {
    const row = await this.repository.update(id, { active: true });
    return mapDbProductToProduct(row);
  }

  private validate(data: ProductInput): void {
    if (!data.name?.trim()) throw new Error(i18n.t('errors.product_name_required'));
    if (typeof data.price !== 'number' || Number.isNaN(data.price)) {
      throw new Error(i18n.t('errors.product_price_required'));
    }
    if (data.price <= 0) throw new Error(i18n.t('errors.product_price_positive'));
  }

  private rethrow(err: unknown): never {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('uq_products_name_tenant_branch') || msg.includes('duplicate')) {
      throw new Error(i18n.t('errors.product_name_exists'));
    }
    throw err instanceof Error ? err : new Error(i18n.t('errors.connection_error'));
  }
}
