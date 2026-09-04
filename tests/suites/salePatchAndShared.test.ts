import {
  addSale,
  applyCollectionToSales,
  applyVoidedSales,
  removeSales,
  replaceSale,
  saleUsd,
} from '@/src/modules/transaction/sales/utils/saleListPatch';
import {
  cartUnits,
  lineName,
  lineQuantity,
  productLines,
  savedUnits,
  stockDelta,
  toItemPayload,
} from '@/src/modules/transaction/sales/utils/saleLines';
import {
  sharedBillsAcross,
  sharedBillsOf,
} from '@/src/modules/ledger/utils/sharedBills';
import type { Product, Sale, SaleItem } from '@/src/core/types';
import { charge, collection, collectionItem, LBP } from '../helpers/factories';

// TC-SP-* — the pure patches every sales list applies instead of re-reading.
// TC-SS-* — naming the OTHER bills a shared hand-over settled, before a void.

const product = { id: 'p1', name: 'Router' } as Product;

function sale(over: Partial<Sale> = {}): Sale {
  return {
    id: 's1', tenantId: 't1', branchId: null, itemsSummary: 'Router',
    customerId: 'cust-1', recordedByUserId: 'user-1', totalAmount: 30,
    amountPaid: 0, chargeId: 'chg-1', charge: null, currencyId: null,
    ratePerUsdSnapshot: 1, soldAt: '2026-02-01T00:00:00.000Z', voidedAt: null,
    voidedBy: null, voidReason: null, notes: null,
    createdAt: '2026-02-01T00:00:00.000Z', items: [], customer: null,
    ...over,
  };
}

describe('sale list patches', () => {
  it('TC-SP-01 a new sale goes to the top (every list is newest first)', () => {
    const existing = [sale({ id: 'old' })];
    expect(addSale(existing, sale({ id: 'new' })).map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('TC-SP-02 an edit swaps the row in place', () => {
    const items = [sale({ id: 'a' }), sale({ id: 'b' })];
    const out = replaceSale(items, sale({ id: 'b', totalAmount: 99 }));
    expect(out.map((s) => s.totalAmount)).toEqual([30, 99]);
  });

  it('TC-SP-03 an edit that moved the sale to another customer drops it', () => {
    const items = [sale({ id: 'a', customerId: 'cust-1' })];
    const moved = sale({ id: 'a', customerId: 'cust-2' });
    expect(replaceSale(items, moved, (s) => s.customerId === 'cust-1')).toEqual([]);
  });

  it('TC-SP-04 a void removes the row', () => {
    expect(removeSales([sale({ id: 'a' }), sale({ id: 'b' })], ['a']).map((s) => s.id))
      .toEqual(['b']);
  });

  it('TC-SP-04b a void drops the row from a list that hides voided sales', () => {
    const items = [sale({ id: 'a' }), sale({ id: 'b' })];
    const voided = sale({ id: 'a', voidedAt: '2026-02-02T00:00:00.000Z' });
    expect(applyVoidedSales(items, [voided], false).map((s) => s.id)).toEqual(['b']);
  });

  it('TC-SP-04c a void KEEPS the row, marked, when the list shows voided sales', () => {
    const items = [sale({ id: 'a' }), sale({ id: 'b' })];
    const voided = sale({ id: 'a', voidedAt: '2026-02-02T00:00:00.000Z', voidReason: 'wrong item' });
    const out = applyVoidedSales(items, [voided], true);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out[0].voidedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(out[0].voidReason).toBe('wrong item');
    expect(out[1].voidedAt).toBeNull();
  });

  it('TC-SP-04d a whole selection is voided in one pass, order kept', () => {
    const items = [sale({ id: 'a' }), sale({ id: 'b' }), sale({ id: 'c' })];
    const voided = ['a', 'c'].map((id) => sale({ id, voidedAt: '2026-02-02T00:00:00.000Z' }));
    expect(applyVoidedSales(items, voided, false).map((s) => s.id)).toEqual(['b']);
    expect(applyVoidedSales(items, voided, true).filter((s) => s.voidedAt !== null).map((s) => s.id))
      .toEqual(['a', 'c']);
  });

  it('TC-SP-05 money lands only on the sales the hand-over actually names', () => {
    const items = [sale({ id: 'a', chargeId: 'chg-a' }), sale({ id: 'b', chargeId: 'chg-b' })];
    const col = collection({ items: [collectionItem({ chargeId: 'chg-a', amount: 12 })] });
    expect(applyCollectionToSales(items, col).map((s) => s.amountPaid)).toEqual([12, 0]);
  });

  it('TC-SP-06 a voided hand-over takes its money back, never below zero', () => {
    const items = [sale({ id: 'a', chargeId: 'chg-a', amountPaid: 5 })];
    const col = collection({ items: [collectionItem({ chargeId: 'chg-a', amount: 12 })] });
    expect(applyCollectionToSales(items, col, -1)[0].amountPaid).toBe(0);
  });

  it('TC-SP-07 a sale with no bill yet is never patched', () => {
    const items = [sale({ id: 'a', chargeId: null })];
    const col = collection({ items: [collectionItem({ chargeId: 'chg-a', amount: 12 })] });
    expect(applyCollectionToSales(items, col)[0].amountPaid).toBe(0);
  });

  it('TC-SP-08 saleUsd converts at the sale`s OWN frozen rate', () => {
    expect(saleUsd(sale({ totalAmount: 180000, ratePerUsdSnapshot: 90000 }))).toBe(2);
  });
});

describe('sale lines', () => {
  it('TC-SP-10 a service line is always one unit, whatever it costs', () => {
    expect(lineQuantity({ kind: 'service', service: null, name: 'Fit', unitAmount: 15 })).toBe(1);
    expect(lineQuantity({ kind: 'product', product, quantity: 4, unitAmount: 5 })).toBe(4);
  });

  it('TC-SP-11 a one-off service is named by what was typed', () => {
    expect(lineName({ kind: 'service', service: null, name: '  Repair visit ', unitAmount: 15 }))
      .toBe('Repair visit');
  });

  it('TC-SP-12 only product lines reach the stock ledger', () => {
    const items = [
      { kind: 'product', product, quantity: 2, unitAmount: 5 },
      { kind: 'service', service: null, name: 'Fit', unitAmount: 15 },
    ] as const;
    expect(productLines([...items])).toHaveLength(1);
    expect(cartUnits([...items])).toEqual(new Map([['p1', 2]]));
  });

  it('TC-SP-13 the same product on two lines counts once, summed', () => {
    const items = [
      { kind: 'product', product, quantity: 2, unitAmount: 5 },
      { kind: 'product', product, quantity: 3, unitAmount: 5 },
    ] as const;
    expect(cartUnits([...items]).get('p1')).toBe(5);
  });

  it('TC-SP-14 stockDelta: recording takes, voiding gives back', () => {
    const cart = new Map([['p1', 2]]);
    expect(stockDelta(new Map(), cart)).toEqual({ p1: -2 });
    expect(stockDelta(cart, new Map())).toEqual({ p1: 2 });
    expect(stockDelta(cart, cart)).toEqual({});
  });

  it('TC-SP-15 savedUnits ignores a service line and a null product id', () => {
    const items: SaleItem[] = [
      { id: 'i1', saleId: 's1', tenantId: 't1', lineType: 'product', productId: 'p1',
        serviceId: null, itemNameSnapshot: 'Router', quantity: 2, unitAmount: 5,
        lineTotal: 10, createdAt: '', product: null, service: null },
      { id: 'i2', saleId: 's1', tenantId: 't1', lineType: 'service', productId: null,
        serviceId: null, itemNameSnapshot: 'Fit', quantity: 1, unitAmount: 15,
        lineTotal: 15, createdAt: '', product: null, service: null },
    ];
    expect(savedUnits(items)).toEqual(new Map([['p1', 2]]));
  });

  it('TC-SP-16 toItemPayload sets exactly one id column per kind', () => {
    expect(toItemPayload({ kind: 'product', product, quantity: 2, unitAmount: 5 }, 't1'))
      .toMatchObject({ line_type: 'product', product_id: 'p1', service_id: null, quantity: 2 });
    expect(toItemPayload({ kind: 'service', service: null, name: 'Fit', unitAmount: 15 }, 't1'))
      .toMatchObject({ line_type: 'service', product_id: null, service_id: null, quantity: 1 });
  });
});

describe('sharedBillsOf', () => {
  const t = (key: string) => key;

  it('TC-SS-01 names the OTHER bills, never the one being acted on', () => {
    const col = collection({
      items: [
        collectionItem({ chargeId: 'jan', amount: 20, charge: charge({ id: 'jan', billingMonth: '2026-01-01' }) }),
        collectionItem({ chargeId: 'feb', amount: 20, charge: charge({ id: 'feb', billingMonth: '2026-02-01' }) }),
      ],
    });
    const shared = sharedBillsOf(col, 'jan', t);
    expect(shared).toHaveLength(1);
    expect(shared[0].chargeId).toBe('feb');
  });

  it('TC-SS-02 a hand-over that settled only this bill has nothing to warn about', () => {
    const col = collection({ items: [collectionItem({ chargeId: 'jan', amount: 20 })] });
    expect(sharedBillsOf(col, 'jan', t)).toEqual([]);
  });

  it('TC-SS-03 the amount carries the PARENT hand-over`s currency and rate', () => {
    const col = collection({
      currencyId: LBP.id,
      ratePerUsdSnapshot: 90000,
      items: [collectionItem({ chargeId: 'feb', amount: 180000 })],
    });
    expect(sharedBillsOf(col, 'jan', t)[0].snapshot)
      .toEqual({ currencyId: LBP.id, ratePerUsdSnapshot: 90000 });
  });

  it('TC-SS-04 across many hand-overs, the same bill merges — but never across currencies', () => {
    const usd = collection({
      id: 'c1', items: [collectionItem({ id: 'a', chargeId: 'feb', amount: 5 })],
    });
    const usd2 = collection({
      id: 'c2', items: [collectionItem({ id: 'b', chargeId: 'feb', amount: 7 })],
    });
    const lbp = collection({
      id: 'c3', currencyId: LBP.id, ratePerUsdSnapshot: 90000,
      items: [collectionItem({ id: 'c', chargeId: 'feb', amount: 90000 })],
    });
    const merged = sharedBillsAcross([usd, usd2, lbp], 'jan', t);
    expect(merged).toHaveLength(2);
    expect(merged.find((b) => b.snapshot.currencyId === null)!.amount).toBe(12);
    expect(merged.find((b) => b.snapshot.currencyId === LBP.id)!.amount).toBe(90000);
  });

  it('TC-SS-05 a line with no loaded charge still names something', () => {
    const col = collection({ items: [collectionItem({ chargeId: 'x', amount: 5 })] });
    expect(sharedBillsOf(col, 'jan', t)[0].label).toBe('ledger.shared_bill_fallback');
  });
});
