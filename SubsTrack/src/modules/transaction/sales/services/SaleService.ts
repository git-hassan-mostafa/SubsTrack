import type { Charge, Sale, SaleItem } from '@/src/core/types';
import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import { newId, nowIso } from '@/src/core/offline/ids';
import repository from '../repository/SaleRepository';
// Direct paths, not the ledger barrel: the barrel reaches components → the
// global store → saleSlice → back here.
import chargeRepository from '@/src/modules/ledger/repository/ChargeRepository';
import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import { mapDbChargeToCharge } from '@/src/modules/ledger/utils/mapper';
import { openItemFromCharge } from '@/src/modules/ledger/utils/openItems';
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

// The bill a brand-new sale just raised, as the collect path wants it. Built
// from what was written rather than read back, so recording a paid sale costs
// no extra round trip.
function saleOpenItem(args: {
  chargeId: string;
  customerId: string | null;
  branchId: string | null;
  label: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
  issuedAt: string;
  /** Already collected against this bill — 0 for a brand-new sale. */
  paid?: number;
}) {
  return openItemFromCharge(
    {
      id: args.chargeId,
      tenantId: '',
      branchId: args.branchId,
      customerId: args.customerId,
      kind: 'sale' as const,
      customerPlanId: null,
      billingMonth: null,
      durationMonths: 1,
      planId: null,
      saleId: null,
      description: null,
      amount: args.amount,
      currencyId: args.currencyId,
      ratePerUsdSnapshot: args.ratePerUsdSnapshot,
      issuedAt: args.issuedAt,
      dueDate: args.dueDate,
      recordedByUserId: null,
      notes: null,
      createdAt: args.issuedAt,
      updatedAt: args.issuedAt,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      writtenOffAt: null,
      writtenOffBy: null,
      writeOffReason: null,
    },
    args.paid ?? 0,
    args.label,
  );
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

  // One sale WITH its lines — for surfaces that hold only an id (a debt row
  // carries no lines).
  async getSaleById(id: string): Promise<Sale | null> {
    const row = await repository.findById(id);
    if (!row) return null;
    const [sale] = await this.withMoney([mapDbSaleToSale(row)]);
    return sale;
  }

  /**
   * Fills in each sale's DERIVED money from its bill.
   *
   * The sale document holds none: what is owed is its `charges` row and what was
   * collected is a sum over `collection_items`. Two extra reads per page, which
   * is what buys a sale the ability to take several payments over time.
   */
  private async withMoney(sales: Sale[]): Promise<Sale[]> {
    if (sales.length === 0) return sales;
    const charges = await chargeRepository.findBySaleIds(sales.map((s) => s.id));
    if (charges.length === 0) return sales;
    const bySale = new Map(charges.map((c) => [c.sale_id!, c]));
    const paid = await this.paidByCharge(charges.map((c) => c.id));
    return sales.map((s) => {
      const charge = bySale.get(s.id);
      if (!charge) return s;
      return { ...s, chargeId: charge.id, amountPaid: paid.get(charge.id) ?? 0 };
    });
  }

  private async paidByCharge(chargeIds: string[]): Promise<Map<string, number>> {
    const balances = await chargeRepository.balances(chargeIds);
    return new Map(balances.map((b) => [b.id, b.paid]));
  }

  /** The bill one sale raised — the receipt lists the payments against it. */
  async getChargeForSale(saleId: string): Promise<Charge | null> {
    const row = await chargeRepository.findBySaleId(saleId);
    return row ? mapDbChargeToCharge(row) : null;
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
    // A walk-in sale is anonymous, so a debt on it could never be chased. It is
    // paid in full at the till or it is not recorded.
    if (!input.customerId && input.amountPaid + 1e-9 < total) {
      throw new Error(i18n.t('errors.sale_walkin_must_be_paid'));
    }
    const soldAt = nowIso();
    const chargeId = newId();
    const itemsSummary = buildItemsSummary(input.items);
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
      // The bill the sale raises. Written in the same transaction offline, so a
      // sale can never exist without the thing that makes it collectable.
      charge: {
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
        // Owed the day it was sold — ageing on a pay-later sale starts now.
        due_date: soldAt.slice(0, 10),
        recorded_by_user_id: input.recordedByUserId,
        notes: null,
      },
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

    // Cash taken at the till goes through the SAME collect path as any later
    // installment — money is recorded in exactly one place, so custody, the
    // audit entry and the currency rules are written once. Should it fail, the
    // sale simply stands fully owed, which is the safe way round.
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
            item: saleOpenItem({
              chargeId,
              customerId: input.customerId,
              branchId: input.branchId,
              label: itemsSummary,
              amount: total,
              currencyId: input.currency?.id ?? null,
              ratePerUsdSnapshot,
              dueDate: soldAt.slice(0, 10),
              issuedAt: soldAt,
            }),
            amount: input.amountPaid,
            settles: input.amountPaid >= total - 1e-9,
          },
        ],
      });
    }

    const [sale] = await this.withMoney([mapDbSaleToSale(row)]);
    return sale;
  }

  // Corrects an existing sale in place: products, quantities, unit prices, the
  // sale currency (which RE-FREEZES rate_per_usd_snapshot, so the corrected row
  // is what history reports), customer and notes. Only the facts that identify
  // the sale are fixed — id, tenant, sold_at, and who originally recorded it.
  // A voided sale is a closed record and stays locked.
  //
  // `input.collectNow` is the one money field, and it never rewrites a payment:
  // it is a NEW hand-over dated now, taken after the bill has been re-priced so
  // it is capped against the corrected total.
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
    const total = totalOf(input.items);
    // Re-pricing may not drop the total below what has already been collected —
    // a balance must never go negative, and money already taken is a fact.
    if (total + 1e-9 < sale.amountPaid) {
      throw new Error(i18n.t('errors.sale_total_below_collected'));
    }
    const collectNow = input.collectNow ?? 0;
    // Same rule as a new sale, reachable here by clearing the customer or by
    // raising the price of a walk-in: an anonymous debt could never be chased.
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
      // What is OWED follows the sale; what was COLLECTED is its own row.
      charge: {
        amount: total,
        currency_id: input.currency?.id ?? null,
        rate_per_usd_snapshot: ratePerUsdSnapshot,
      },
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

    // Cash taken while correcting the sale — the same collect path as the till
    // and as any later installment, so custody, the audit entry, the currency
    // rule and the overpay check stay written in exactly one place. Additive by
    // construction: it can only ever create a hand-over, never edit one.
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
            item: saleOpenItem({
              chargeId: charge.id,
              customerId: input.customerId,
              branchId: input.branchId,
              label: buildItemsSummary(input.items),
              amount: total,
              currencyId: input.currency?.id ?? null,
              ratePerUsdSnapshot,
              dueDate: charge.due_date,
              issuedAt: charge.issued_at,
              paid: sale.amountPaid,
            }),
            amount: collectNow,
            settles: collectNow >= owing - 1e-9,
          },
        ],
      });
    }

    const [updated] = await this.withMoney([mapDbSaleToSale(row)]);
    return updated;
  }

  /** How many sales happened in a window — the dashboard's activity count. */
  countInRange(startIso: string, endExclusiveIso: string, branchFilter: BranchFilter = null) {
    return repository.countInRange(startIso, endExclusiveIso, branchFilter);
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

  /**
   * The sale never happened: the header, its stock movements and its bill are
   * all voided together.
   *
   * Refused once money has been collected against the bill — that cash is real
   * and points at this sale, so the collection has to be voided first. Same
   * rule, and the same reason, as ChargeService.voidCharge.
   */
  async voidSale(id: string, voidedBy: string, reason: string): Promise<Sale> {
    const charge = await chargeRepository.findBySaleId(id);
    if (charge) {
      const paid = (await this.paidByCharge([charge.id])).get(charge.id) ?? 0;
      if (paid > 0) throw new Error(i18n.t('errors.sale_void_has_money'));
    }
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
  private validate(input: { items: CreateSaleItemInput[]; amountPaid?: number }): void {
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
    // Only a NEW sale takes cash at the till; an edit re-prices the bill and
    // leaves every collection alone, so it passes no amount at all.
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
