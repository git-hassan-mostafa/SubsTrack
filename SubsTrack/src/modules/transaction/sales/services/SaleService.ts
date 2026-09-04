import type { Charge, Sale, SaleItem } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import { newId, nowIso } from '@/src/core/offline/ids';
import { localMonthKey } from '@/src/core/utils/date';
import repository from '../repository/SaleRepository';
import chargeRepository from '@/src/modules/ledger/repository/ChargeRepository';
import collectionRepository from '@/src/modules/ledger/repository/CollectionRepository';
import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import { mapDbChargeToCharge } from '@/src/modules/ledger/utils/mapper';
import { openItemFromCharge } from '@/src/modules/ledger/utils/openItems';
import productService from '@/src/modules/admin/products/services/ProductService';
import {
  CreateSaleInput,
  CreateSaleItemInput,
  UpdateSaleInput,
  type FindSalesOptions,
} from '../utils/types'
import type { SaleChargePayload } from '../repository/ISaleRepository';
import { mapDbSaleToSale } from '../utils/mapper';
import {
  cartUnits,
  lineName,
  lineQuantity,
  productLines,
  savedUnits,
  toItemPayload,
  type ProductLineInput,
} from '../utils/saleLines';

// Frozen human summary of everything in a sale, e.g. "Water ×2, Installation".
// Contains every line's name — products and services alike — so the Sales-tab
// search, the debt label and the wallet label can all match on it. A service
// never shows a count (it is always one job), so it prints as a bare name.
function buildItemsSummary(items: CreateSaleItemInput[]): string {
  return items
    .map((it) => {
      const name = lineName(it);
      const qty = lineQuantity(it);
      return qty > 1 ? `${name} ×${qty}` : name;
    })
    .join(', ');
}

function totalOf(items: CreateSaleItemInput[]): number {
  return items.reduce((sum, it) => sum + it.unitAmount * lineQuantity(it), 0);
}

// The bill a sale just raised, as a domain Charge — built from what was
// written, so recording a paid sale costs no extra round trip.
function chargeFromPayload(
  payload: SaleChargePayload,
  saleId: string,
  at: string,
): Charge {
  return mapDbChargeToCharge({
    ...payload,
    sale_id: saleId,
    created_at: at,
    updated_at: at,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    written_off_at: null,
    written_off_by: null,
    write_off_reason: null,
  });
}

class SaleService {
  async getSales(opts: FindSalesOptions = {}): Promise<Sale[]> {
    const rows = await repository.findAll(opts);
    return this.withMoney(rows.map(mapDbSaleToSale));
  }

  async getSalesForCustomer(customerId: string, limit = 20): Promise<Sale[]> {
    const rows = await repository.findByCustomer(customerId, limit);
    return this.withMoney(rows.map(mapDbSaleToSale));
  }

  async getSaleById(id: string): Promise<Sale | null> {
    const row = await repository.findById(id);
    if (!row) return null;
    const [sale] = await this.withMoney([mapDbSaleToSale(row)]);
    return sale;
  }

  private async withMoney(sales: Sale[]): Promise<Sale[]> {
    if (sales.length === 0) return sales;
    const charges = await chargeRepository.findBySaleIds(sales.map((s) => s.id));
    if (charges.length === 0) return sales;
    const bySale = new Map(charges.map((c) => [c.sale_id!, c]));
    const paid = await this.paidByCharge(charges.map((c) => c.id));
    return sales.map((s) => {
      const charge = bySale.get(s.id);
      if (!charge) return s;
      return {
        ...s,
        chargeId: charge.id,
        charge: mapDbChargeToCharge(charge),
        amountPaid: paid.get(charge.id) ?? 0,
      };
    });
  }

  private async paidByCharge(chargeIds: string[]): Promise<Map<string, number>> {
    const balances = await chargeRepository.balances(chargeIds);
    return new Map(balances.map((b) => [b.id, b.paid]));
  }

  async createSale(input: CreateSaleInput): Promise<Sale> {
    this.validate(input);
    await this.assertStockAvailable(productLines(input.items));
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const total = totalOf(input.items);
    if (!input.customerId && input.amountPaid + 1e-9 < total) {
      throw new Error(i18n.t('errors.sale_walkin_must_be_paid'));
    }
    const soldAt = nowIso();
    const chargeId = newId();
    const itemsSummary = buildItemsSummary(input.items);
    const chargePayload: SaleChargePayload = {
      id: chargeId,
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: input.customerId,
      kind: 'sale',
      customer_plan_id: null,
      billing_month: null,
      duration_months: 1,
      plan_id: null,
      description: null,
      amount: total,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      issued_at: soldAt,
      due_date: soldAt.slice(0, 10),
      recorded_by_user_id: input.recordedByUserId,
      notes: null,
    };
    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      items_summary: itemsSummary,
      customer_id: input.customerId,
      recorded_by_user_id: input.recordedByUserId,
      total_amount: total,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      sold_at: soldAt,
      notes: input.notes?.trim() || null,
      charge: chargePayload,
      items: input.items.map((it) => toItemPayload(it, input.tenantId)),
      movements: productLines(input.items).map((it) =>
        productService.movement(input.tenantId, it.product.id, -it.quantity, 'sale', {
          userId: input.recordedByUserId,
        }),
      ),
    });

    const charge = chargeFromPayload(chargePayload, row.id, soldAt);
    if (input.amountPaid > 0) {
      await collectionService.collect({
        tenantId: input.tenantId,
        customerId: input.customerId,
        branchId: input.branchId,
        amount: input.amountPaid,
        currencyId: input.currency?.id ?? null,
        ratePerUsdSnapshot,
        receivedAt: soldAt,
        receivedByUserId: input.recordedByUserId,
        notes: null,
        lines: [
          {
            item: openItemFromCharge(charge, 0, itemsSummary),
            amount: input.amountPaid,
            settles: input.amountPaid >= total - 1e-9,
          },
        ],
      });
    }

    return {
      ...mapDbSaleToSale(row),
      chargeId: charge.id,
      charge,
      amountPaid: input.amountPaid,
    };
  }

  async updateSale(sale: Sale, input: UpdateSaleInput): Promise<Sale> {
    if (sale.voidedAt !== null) {
      throw new Error(i18n.t('errors.sale_voided_not_editable'));
    }
    this.validate(input);
    await this.assertStockAvailable(
      productLines(input.items),
      savedUnits(sale.items),
    );
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const total = totalOf(input.items);
    if (total + 1e-9 < sale.amountPaid) {
      throw new Error(i18n.t('errors.sale_total_below_collected'));
    }
    const nextCurrencyId = input.currency?.id ?? null;
    if (sale.amountPaid > 0 && nextCurrencyId !== sale.currencyId) {
      throw new Error(i18n.t('errors.sale_currency_locked'));
    }
    const collectNow = input.collectNow ?? 0;
    if (!input.customerId && sale.amountPaid + collectNow + 1e-9 < total) {
      throw new Error(i18n.t('errors.sale_walkin_must_be_paid'));
    }
    const row = await repository.update(sale.id, {
      branch_id: input.branchId,
      items_summary: buildItemsSummary(input.items),
      customer_id: input.customerId,
      total_amount: total,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      notes: input.notes?.trim() || null,
      charge: {
        amount: total,
        currency_id: input.currency?.id ?? null,
        rate_per_usd_snapshot: ratePerUsdSnapshot,
      },
      items: input.items.map((it) => toItemPayload(it, sale.tenantId)),
      movements: this.sameStockFootprint(sale.items, input.items)
        ? null
        : productLines(input.items).map((it) =>
          productService.movement(sale.tenantId, it.product.id, -it.quantity, 'sale', {
            userId: input.actorUserId,
          }),
        ),
      actorUserId: input.actorUserId,
    });

    if (collectNow > 0) {
      const charge = await chargeRepository.findBySaleId(sale.id);
      if (!charge) throw new Error(i18n.t('errors.collect_unknown_item'));
      const owing = total - sale.amountPaid;
      if (collectNow > owing + 1e-9) {
        throw new Error(i18n.t('errors.collect_exceeds_balance'));
      }
      await collectionService.collect({
        tenantId: sale.tenantId,
        customerId: input.customerId,
        branchId: input.branchId,
        amount: collectNow,
        currencyId: input.currency?.id ?? null,
        ratePerUsdSnapshot,
        receivedAt: nowIso(),
        receivedByUserId: input.actorUserId,
        notes: null,
        lines: [
          {
            item: openItemFromCharge(
              mapDbChargeToCharge(charge),
              sale.amountPaid,
              buildItemsSummary(input.items),
            ),
            amount: collectNow,
            settles: collectNow >= owing - 1e-9,
          },
        ],
      });
    }

    const [updated] = await this.withMoney([mapDbSaleToSale(row)]);
    return updated;
  }

  countInRange(startIso: string, endExclusiveIso: string, branchFilter: BranchFilter = null) {
    return repository.countInRange(startIso, endExclusiveIso, branchFilter);
  }

  async getMonthlyTotals(opts: FindSalesOptions = {}): Promise<Record<string, number>> {
    const rows = await repository.monthlyTotals(opts);
    const totals: Record<string, number> = {};
    for (const r of rows) {
      const key = localMonthKey(r.soldAt);
      totals[key] = (totals[key] ?? 0) + r.amount / r.ratePerUsdSnapshot;
    }
    return totals;
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<Sale> {
    const trimmed = reason.trim();
    await this.voidPaymentsForSales([id], voidedBy, trimmed);
    const row = await repository.voidSale(id, voidedBy, trimmed);
    return mapDbSaleToSale(row);
  }

  async voidSales(
    ids: string[],
    voidedBy: string,
    reason: string,
  ): Promise<{ voided: Sale[]; failed: { id: string; message: string }[] }> {
    const trimmed = reason.trim();
    const voided: Sale[] = [];
    const failed: { id: string; message: string }[] = [];
    if (ids.length === 0) return { voided, failed };
    await this.voidPaymentsForSales(ids, voidedBy, trimmed);
    for (const id of ids) {
      try {
        const row = await repository.voidSale(id, voidedBy, trimmed);
        voided.push(mapDbSaleToSale(row));
      } catch (e) {
        failed.push({ id, message: (e as Error).message });
      }
    }
    return { voided, failed };
  }

  private async voidPaymentsForSales(
    saleIds: string[],
    voidedBy: string,
    reason: string,
  ): Promise<void> {
    const charges = await chargeRepository.findBySaleIds(saleIds);
    if (charges.length === 0) return;
    const paymentIds = await chargeService.paymentIdsForCharges(charges.map((c) => c.id));
    if (paymentIds.length === 0) return;
    await collectionRepository.voidMany(paymentIds, voidedBy, reason || null);
  }

  private sameStockFootprint(before: SaleItem[], after: CreateSaleItemInput[]): boolean {
    const was = savedUnits(before);
    const now = cartUnits(after);
    if (was.size !== now.size) return false;
    for (const [id, quantity] of was) if (now.get(id) !== quantity) return false;
    return true;
  }

  private async assertStockAvailable(
    items: ProductLineInput[],
    credited: Map<string, number> = new Map(),
  ): Promise<void> {
    if (items.length === 0) return;
    const needed = new Map<string, { name: string; quantity: number }>();
    for (const it of items) {
      const prev = needed.get(it.product.id);
      needed.set(it.product.id, {
        name: it.product.name,
        quantity: (prev?.quantity ?? 0) + it.quantity,
      });
    }
    const onHand = await productService.getStockOnHand([...needed.keys()]);
    for (const [id, { name, quantity }] of needed) {
      const available = (onHand[id] ?? 0) + (credited.get(id) ?? 0);
      if (available <= 0) {
        throw new Error(i18n.t('errors.sale_out_of_stock', { product: name }));
      }
      if (available < quantity) {
        throw new Error(i18n.t('errors.sale_insufficient_stock', { product: name, available }));
      }
    }
  }

  private validate(input: { items: CreateSaleItemInput[]; amountPaid?: number }): void {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error(i18n.t('errors.sale_items_required'));
    }
    for (const it of input.items) {
      if (it.kind === 'product') {
        if (!it.product?.id) throw new Error(i18n.t('errors.sale_product_required'));
        if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
          throw new Error(i18n.t('errors.sale_quantity_invalid'));
        }
      } else if (!lineName(it)) {
        throw new Error(i18n.t('errors.sale_service_required'));
      }
      if (typeof it.unitAmount !== 'number' || Number.isNaN(it.unitAmount) || it.unitAmount <= 0) {
        throw new Error(i18n.t('errors.sale_amount_positive'));
      }
    }
    if (input.amountPaid === undefined) return;
    const total = totalOf(input.items);
    if (
      typeof input.amountPaid !== 'number' ||
      Number.isNaN(input.amountPaid) ||
      input.amountPaid < 0 ||
      input.amountPaid > total + 1e-9
    ) {
      throw new Error(i18n.t('errors.sale_amount_paid_invalid'));
    }
  }
}

export default new SaleService()
