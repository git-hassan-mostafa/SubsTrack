import type { DbSale, DbSaleItem } from '@/src/core/types/db';
import type {
  CreateSalePayload,
  UpdateSalePayload,
} from '@/src/modules/transaction/sales/repository/ISaleRepository';
import { store } from './fakeLedger';

/**
 * In-memory sales, following the two real repositories' documented contract:
 * the header, its lines, its stock movements AND its bill are one write; an
 * edit matches lines by position and soft-voids a dropped one; a void takes the
 * sale's own bill with it.
 */

let sales: DbSale[] = [];
let saleItems: DbSaleItem[] = [];
let movements: unknown[] = [];
let n = 0;
const nextId = (p: string) => `${p}-${++n}`;

export const saleStore = {
  get sales() {
    return sales;
  },
  get items() {
    return saleItems;
  },
  get movements() {
    return movements;
  },
  sale(id: string) {
    return sales.find((s) => s.id === id) ?? null;
  },
  liveItems(saleId: string) {
    return saleItems.filter((i) => i.sale_id === saleId && i.voided_at === null);
  },
  reset() {
    sales = [];
    saleItems = [];
    movements = [];
    n = 0;
  },
};

function hydrate(row: DbSale): DbSale {
  return { ...row, sale_items: saleItems.filter((i) => i.sale_id === row.id) };
}

export const fakeSaleRepository = {
  async findAll() {
    return sales.map(hydrate);
  },
  async findByCustomer(customerId: string) {
    return sales.filter((s) => s.customer_id === customerId).map(hydrate);
  },
  async findById(id: string) {
    const row = sales.find((s) => s.id === id);
    return row ? hydrate(row) : null;
  },
  async create(payload: CreateSalePayload): Promise<DbSale> {
    const { items, movements: mv, charge, ...header } = payload;
    const now = new Date().toISOString();
    const row: DbSale = {
      ...(header as Omit<DbSale, 'id' | 'created_at' | 'updated_at' | 'voided_at' | 'voided_by' | 'void_reason'>),
      id: nextId('sale'),
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
    } as DbSale;
    sales.push(row);
    for (const it of items) {
      saleItems.push({
        ...it,
        id: nextId('si'),
        sale_id: row.id,
        voided_at: null,
        created_at: now,
        updated_at: now,
      } as DbSaleItem);
    }
    for (const m of mv) movements.push({ ...(m as object), sale_id: row.id });
    // The bill travels with the header — one write, never two.
    store.seedCharge({ ...charge, sale_id: row.id });
    return hydrate(row);
  },
  async update(id: string, payload: UpdateSalePayload): Promise<DbSale> {
    const row = sales.find((s) => s.id === id && s.voided_at === null)!;
    const { items, movements: mv, charge, actorUserId, ...header } = payload;
    Object.assign(row, header, { updated_at: new Date().toISOString() });

    // Lines are matched to the existing rows BY POSITION; a dropped line is
    // soft-voided because the sync engine has no tombstones for sale_items.
    const existing = saleItems.filter((i) => i.sale_id === id && i.voided_at === null);
    items.forEach((it, i) => {
      if (existing[i]) Object.assign(existing[i], it);
      else {
        saleItems.push({
          ...it, id: nextId('si'), sale_id: id, voided_at: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as DbSaleItem);
      }
    });
    for (let i = items.length; i < existing.length; i++) {
      existing[i].voided_at = new Date().toISOString();
    }

    if (mv !== null) {
      movements = movements.filter((m) => (m as { sale_id: string }).sale_id !== id);
      for (const m of mv) movements.push({ ...(m as object), sale_id: id });
    }
    const bill = store.charges.find((c) => c.sale_id === id);
    if (bill) Object.assign(bill, charge);
    return hydrate(row);
  },
  async voidSale(id: string, voidedBy: string, reason: string): Promise<DbSale> {
    const row = sales.find((s) => s.id === id)!;
    Object.assign(row, {
      voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason,
    });
    // The sale's own bill goes in the same transaction.
    const bill = store.charges.find((c) => c.sale_id === id);
    if (bill) {
      Object.assign(bill, {
        voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason,
      });
    }
    return hydrate(row);
  },
  async monthlyTotals() {
    return sales
      .filter((s) => s.voided_at === null)
      .map((s) => ({
        soldAt: s.sold_at,
        amount: Number(s.total_amount),
        ratePerUsdSnapshot: Number(s.rate_per_usd_snapshot),
      }));
  },
  async countInRange(startIso: string, endExclusiveIso: string) {
    return sales.filter((s) => s.sold_at >= startIso && s.sold_at < endExclusiveIso).length;
  },
};

/** Stock the fake product service reports, per product id. */
export const stockOnHand: Record<string, number> = {};

export const fakeProductService = {
  async getStockOnHand(ids: string[]) {
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = stockOnHand[id] ?? 0;
    return out;
  },
  movement(
    tenantId: string,
    productId: string,
    quantityDelta: number,
    reason: string,
    opts: { userId?: string | null } = {},
  ) {
    return {
      tenant_id: tenantId,
      product_id: productId,
      quantity_delta: quantityDelta,
      reason,
      recorded_by_user_id: opts.userId ?? null,
    };
  },
};
