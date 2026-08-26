import type { Sale, SaleItem } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import repository from '../repository/SaleRepository';
// Direct path, not the products barrel: the barrel pulls in components → the
// global store → saleSlice → back here.
import productService from '@/src/modules/admin/products/services/ProductService';
import {
  CreateSaleInput,
  CreateSaleItemInput,
  UpdateSaleInput,
  type FindSalesOptions,
} from '../utils/types'
import { mapDbSaleToSale } from '../utils/mapper';
import {
  lineName,
  lineQuantity,
  productLines,
  savedProductLines,
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

// Units per product, which is the granularity stock cares about — the same
// product can sit on several lines and only their sum has to be covered.
function unitsByProduct(items: { productId: string; quantity: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
  return map;
}

class SaleService {
  async getSales(opts: FindSalesOptions = {}): Promise<Sale[]> {
    const rows = await repository.findAll(opts);
    return rows.map(mapDbSaleToSale);
  }

  async getSalesForCustomer(customerId: string, limit = 20): Promise<Sale[]> {
    const rows = await repository.findByCustomer(customerId, limit);
    return rows.map(mapDbSaleToSale);
  }

  // One sale WITH its lines — for surfaces that hold only an id (a debt row
  // comes from the lean partialSales select, which carries no lines).
  async getSaleById(id: string): Promise<Sale | null> {
    const row = await repository.findById(id);
    return row ? mapDbSaleToSale(row) : null;
  }

  async createSale(input: CreateSaleInput): Promise<Sale> {
    this.validate(input);
    // Fresh read, not the cached product list — the store can be minutes stale.
    // Every entry point (sale form, quick actions, customer screens) goes
    // through here, so this is the one place stock can be enforced. Service
    // lines are absent from `productLines`, so a service-only sale skips it.
    await this.assertStockAvailable(productLines(input.items));
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const total = totalOf(input.items);
    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      items_summary: buildItemsSummary(input.items),
      customer_id: input.customerId,
      recorded_by_user_id: input.recordedByUserId,
      total_amount: total,
      amount_paid: input.amountPaid,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      sold_at: new Date().toISOString(),
      notes: input.notes?.trim() || null,
      items: input.items.map((it) => toItemPayload(it, input.tenantId)),
      // Stock leaving with the sale — PRODUCT lines only, since labour comes off
      // no shelf. Written by the repository alongside the header + lines
      // (offline: same transaction), so a sale can never exist without the stock
      // it consumed. An empty array is the normal case for a service-only sale.
      // sale_id is filled in there.
      movements: productLines(input.items).map((it) =>
        productService.movement(input.tenantId, it.product.id, -it.quantity, 'sale', {
          userId: input.recordedByUserId,
        }),
      ),
    });
    return mapDbSaleToSale(row);
  }

  // Corrects an existing sale in place: products, quantities, unit prices, the
  // sale currency (which RE-FREEZES rate_per_usd_snapshot, so the corrected row
  // is what history reports), customer, amount collected and notes. Only the
  // facts that identify the sale are fixed — id, tenant, sold_at, and who
  // originally recorded it. A voided sale is a closed record and stays locked.
  async updateSale(sale: Sale, input: UpdateSaleInput): Promise<Sale> {
    if (sale.voidedAt !== null) {
      throw new Error(i18n.t('errors.sale_voided_not_editable'));
    }
    this.validate(input);
    // The units this sale is holding come back to the pool as part of the same
    // edit, so they count as available — without the credit, merely re-pricing a
    // sale that took the last unit would fail its own stock check.
    await this.assertStockAvailable(
      productLines(input.items),
      unitsByProduct(savedProductLines(sale.items)),
    );
    const ratePerUsdSnapshot = input.currency?.ratePerUsd ?? 1;
    if (!(ratePerUsdSnapshot > 0)) {
      throw new Error(i18n.t('errors.rate_snapshot_positive'));
    }
    const row = await repository.update(sale.id, {
      branch_id: input.branchId,
      items_summary: buildItemsSummary(input.items),
      customer_id: input.customerId,
      total_amount: totalOf(input.items),
      amount_paid: input.amountPaid,
      currency_id: input.currency?.id ?? null,
      rate_per_usd_snapshot: ratePerUsdSnapshot,
      notes: input.notes?.trim() || null,
      items: input.items.map((it) => toItemPayload(it, sale.tenantId)),
      // Only a change in what left the shelf touches the ledger. A price, notes
      // or amount-paid fix leaves it alone, so correcting a sale doesn't litter
      // every product's stock history with a void + re-add pair. Two consequences
      // of a line being able to be a service: a service-only sale compares two
      // empty footprints and correctly leaves the ledger alone, and replacing the
      // last product line with a service yields `[]`, which voids the old
      // movements and inserts none — giving the stock back exactly once.
      movements: this.sameStockFootprint(sale.items, input.items)
        ? null
        : productLines(input.items).map((it) =>
          productService.movement(sale.tenantId, it.product.id, -it.quantity, 'sale', {
            userId: input.actorUserId,
          }),
        ),
      actorUserId: input.actorUserId,
    });
    return mapDbSaleToSale(row);
  }

  // "Complete" a partly-paid sale: the customer really paid in full, the amount
  // collected was just written down short. A CORRECTION, so it raises the sale's
  // own `amount_paid` to the total instead of recording a debt payment — the debt
  // disappears because the sale no longer owes anything. Lines, prices and the
  // stock ledger are untouched; the money still counts on the original `sold_at`.
  async completeSale(id: string): Promise<Sale> {
    const row = await repository.findById(id);
    if (!row) throw new Error(i18n.t('errors.sale_missing'));
    const sale = mapDbSaleToSale(row);
    if (sale.voidedAt !== null) {
      throw new Error(i18n.t('errors.sale_voided_not_editable'));
    }
    if (sale.amountPaid >= sale.totalAmount) return sale;
    return mapDbSaleToSale(await repository.updateAmountPaid(id, sale.totalAmount));
  }

  // Buckets monthlyTotals() rows into per-calendar-month USD sums ("YYYY-MM"
  // keys, by sold_at) — the authoritative total for a Sales tab section
  // header, independent of how many of that month's rows are paginated in.
  async getMonthlyTotals(opts: FindSalesOptions = {}): Promise<Record<string, number>> {
    const rows = await repository.monthlyTotals(opts);
    const totals: Record<string, number> = {};
    for (const r of rows) {
      const d = new Date(r.soldAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      totals[key] = (totals[key] ?? 0) + r.amount / r.ratePerUsdSnapshot;
    }
    return totals;
  }

  // Non-voided sales that still owe money (partial sales), for the Debts feature.
  async getPartialSales(branchFilter: BranchFilter = null): Promise<Sale[]> {
    const rows = await repository.partialSales(branchFilter);
    return rows.map(mapDbSaleToSale);
  }

  // Collector wallet: non-voided sales someone is holding, with cash collected
  // (amountPaid > 0). Optionally scoped to one holder.
  async getHeldForWallet(
    branchFilter: BranchFilter = null,
    holderUserId: string | null = null,
  ): Promise<Sale[]> {
    const rows = await repository.heldForWallet(branchFilter, holderUserId);
    return rows.map(mapDbSaleToSale);
  }

  // Move these sales' cash to the next holder (or out of the system when
  // toUserId is null). WalletService decides who may do this.
  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    await repository.transferCustody(ids, fromUserId, toUserId, actorUserId);
  }

  async voidSale(id: string, voidedBy: string, reason: string): Promise<Sale> {
    const row = await repository.voidSale(id, voidedBy, reason.trim());
    return mapDbSaleToSale(row);
  }

  // True when the edited cart takes exactly the same units off the shelf as the
  // saved one. Compared per PRODUCT, not per line: splitting one line of 3 into
  // 1 + 2 moves no stock, so the ledger has nothing to correct. Service lines are
  // invisible here on both sides — adding or re-pricing labour moves no stock.
  private sameStockFootprint(before: SaleItem[], after: CreateSaleItemInput[]): boolean {
    const was = unitsByProduct(savedProductLines(before));
    const now = unitsByProduct(
      productLines(after).map((it) => ({ productId: it.product.id, quantity: it.quantity })),
    );
    if (was.size !== now.size) return false;
    for (const [id, quantity] of was) if (now.get(id) !== quantity) return false;
    return true;
  }

  // Blocks a sale that would oversell. The same product can sit on several cart
  // lines, so the check compares the SUM per product, not each line on its own.
  // `credited` is stock the same write gives back (an edit releases the units the
  // sale is currently holding), so it counts as available.
  // Takes PRODUCT lines only — labour has no stock to run out of, and an empty
  // array short-circuits to a no-op with no round trip.
  // Advisory only: two devices selling the last unit offline can still both
  // succeed — the DB must accept whatever they replay (see gotchas).
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

  // Shape-based on purpose — the same rules hold for a new sale and an edited one.
  private validate(input: { items: CreateSaleItemInput[]; amountPaid: number }): void {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error(i18n.t('errors.sale_items_required'));
    }
    for (const it of input.items) {
      // What identifies the line differs by kind: a product line needs a real
      // catalog row, a service line only needs a name (a one-off has no row).
      // Quantity is a product-only rule — a service line has none to check.
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
