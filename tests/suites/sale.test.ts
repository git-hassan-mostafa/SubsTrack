jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));
jest.mock('@/src/modules/transaction/sales/repository/SaleRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeSales').fakeSaleRepository,
}));
jest.mock('@/src/modules/admin/products/services/ProductService', () => ({
  __esModule: true,
  default: require('../helpers/fakeSales').fakeProductService,
}));

import saleService from '@/src/modules/transaction/sales/services/SaleService';
import type {
  CreateSaleInput,
  CreateSaleItemInput,
} from '@/src/modules/transaction/sales/utils/types';
import type { Product } from '@/src/core/types';
import { store } from '../helpers/fakeLedger';
import { saleStore, stockOnHand } from '../helpers/fakeSales';
import { LBP } from '../helpers/factories';

// TC-SL-* — a sale is a header + lines + a BILL. It holds no money: what is
// owed is its `charges` row and what was collected is a `collections` row.

const router: Product = {
  id: 'prod-1', tenantId: 't1', branchId: null, name: 'Router', description: null,
  price: 30, currencyId: null, costPrice: 20, costCurrencyId: null, active: true,
  stockOnHand: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const productLine = (quantity: number, unitAmount = 30): CreateSaleItemInput =>
  ({ kind: 'product', product: router, quantity, unitAmount });
const serviceLine = (unitAmount = 15, name = 'Installation'): CreateSaleItemInput =>
  ({ kind: 'service', service: null, name, unitAmount });

function input(over: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    items: [productLine(1)],
    customerId: 'cust-1',
    branchId: null,
    amountPaid: 0,
    currency: null,
    recordedByUserId: 'user-1',
    tenantId: 't1',
    notes: null,
    ...over,
  };
}

beforeEach(() => {
  store.reset();
  saleStore.reset();
  for (const k of Object.keys(stockOnHand)) delete stockOnHand[k];
  stockOnHand['prod-1'] = 10;
});

describe('createSale: validation', () => {
  it('TC-SL-01 refuses an empty cart', async () => {
    await expect(saleService.createSale(input({ items: [] })))
      .rejects.toThrow(/errors\.sale_items_required/);
  });

  it('TC-SL-02 refuses a non-integer or non-positive product quantity', async () => {
    for (const q of [0, -1, 1.5]) {
      await expect(saleService.createSale(input({ items: [productLine(q)] })))
        .rejects.toThrow(/errors\.sale_quantity_invalid/);
    }
  });

  it('TC-SL-03 refuses a zero or negative unit price on either kind', async () => {
    await expect(saleService.createSale(input({ items: [productLine(1, 0)] })))
      .rejects.toThrow(/errors\.sale_amount_positive/);
    await expect(saleService.createSale(input({ items: [serviceLine(0)] })))
      .rejects.toThrow(/errors\.sale_amount_positive/);
  });

  it('TC-SL-04 refuses a one-off service with no name', async () => {
    await expect(saleService.createSale(input({ items: [serviceLine(15, '  ')] })))
      .rejects.toThrow(/errors\.sale_service_required/);
  });

  it('TC-SL-05 refuses amountPaid above the total, or below zero', async () => {
    await expect(saleService.createSale(input({ amountPaid: 31 })))
      .rejects.toThrow(/errors\.sale_amount_paid_invalid/);
    await expect(saleService.createSale(input({ amountPaid: -1 })))
      .rejects.toThrow(/errors\.sale_amount_paid_invalid/);
  });

  it('TC-SL-06 refuses a rate snapshot that is not positive', async () => {
    await expect(
      saleService.createSale(input({ currency: { ...LBP, ratePerUsd: 0 } })),
    ).rejects.toThrow(/errors\.rate_snapshot_positive/);
  });

  it('TC-SL-07 a WALK-IN must be paid in full — an anonymous debt is unchasable', async () => {
    await expect(saleService.createSale(input({ customerId: null, amountPaid: 10 })))
      .rejects.toThrow(/errors\.sale_walkin_must_be_paid/);
    await expect(saleService.createSale(input({ customerId: null, amountPaid: 30 })))
      .resolves.toBeTruthy();
  });
});

describe('createSale: stock', () => {
  it('TC-SL-10 blocks an oversell, counting the SUM per product across lines', async () => {
    stockOnHand['prod-1'] = 3;
    await expect(
      saleService.createSale(input({ items: [productLine(2), productLine(2)] })),
    ).rejects.toThrow(/errors\.sale_insufficient_stock/);
  });

  it('TC-SL-11 blocks a sale of a product with nothing on the shelf', async () => {
    stockOnHand['prod-1'] = 0;
    await expect(saleService.createSale(input({ items: [productLine(1)] })))
      .rejects.toThrow(/errors\.sale_out_of_stock/);
  });

  it('TC-SL-12 a SERVICE-only sale never touches stock', async () => {
    stockOnHand['prod-1'] = 0;
    const sale = await saleService.createSale(input({ items: [serviceLine(15)], amountPaid: 0 }));
    expect(sale.totalAmount).toBe(15);
    expect(saleStore.movements).toHaveLength(0);
  });

  it('TC-SL-13 one negative movement per PRODUCT line, none for a service', async () => {
    await saleService.createSale(
      input({ items: [productLine(2), serviceLine(15)], amountPaid: 0 }),
    );
    expect(saleStore.movements).toHaveLength(1);
    expect(saleStore.movements[0]).toMatchObject({
      product_id: 'prod-1', quantity_delta: -2, reason: 'sale',
    });
  });
});

describe('createSale: the bill and the till', () => {
  it('TC-SL-20 raises ONE bill for the sale total, owed the day it was sold', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(2)], amountPaid: 0 }));
    const bill = store.charges.find((c) => c.sale_id === sale.id)!;
    expect(bill.kind).toBe('sale');
    expect(bill.amount).toBe(60);
    expect(bill.due_date).toBe(bill.issued_at.slice(0, 10));
    expect(sale.totalAmount).toBe(60);
  });

  it('TC-SL-21 a service line always counts as ONE unit in the total', async () => {
    const sale = await saleService.createSale(
      input({ items: [serviceLine(15), serviceLine(25, 'Repair')], amountPaid: 0 }),
    );
    expect(sale.totalAmount).toBe(40);
    expect(sale.itemsSummary).toBe('Installation, Repair');
  });

  it('TC-SL-22 the summary counts a product but never a service', async () => {
    const sale = await saleService.createSale(
      input({ items: [productLine(3), serviceLine(15)], amountPaid: 0 }),
    );
    expect(sale.itemsSummary).toBe('Router ×3, Installation');
  });

  it('TC-SL-23 cash at the till goes through the normal collect path', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 30 }));
    expect(store.collections).toHaveLength(1);
    expect(store.collections[0].amount).toBe(30);
    expect(store.collections[0].held_by_user_id).toBe('user-1');
    expect(sale.amountPaid).toBe(30);
  });

  it('TC-SL-24 a PART payment leaves the rest owed as a sale debt', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 10 }));
    const [balance] = await require('../helpers/fakeLedger')
      .fakeChargeRepository.balances([sale.chargeId]);
    expect(balance.paid).toBe(10);
    expect(balance.balance).toBe(20);
  });

  it('TC-SL-25 a pay-later sale writes no collection at all', async () => {
    await saleService.createSale(input({ amountPaid: 0 }));
    expect(store.collections).toHaveLength(0);
  });

  it('TC-SL-26 the bill freezes the sale`s currency and rate', async () => {
    const sale = await saleService.createSale(
      input({ items: [productLine(1, 2700000)], currency: LBP, amountPaid: 0 }),
    );
    const bill = store.charges.find((c) => c.sale_id === sale.id)!;
    expect(bill.currency_id).toBe(LBP.id);
    expect(bill.rate_per_usd_snapshot).toBe(90000);
  });
});

describe('updateSale', () => {
  it('TC-SL-30 refuses to edit a voided sale', async () => {
    const sale = await saleService.createSale(input({ amountPaid: 0 }));
    await saleService.voidSale(sale.id, 'user-1', 'mistake');
    const voided = { ...sale, voidedAt: '2026-02-01T00:00:00.000Z' };
    await expect(
      saleService.updateSale(voided, {
        items: [productLine(1)], customerId: 'cust-1', branchId: null,
        currency: null, notes: null, actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/errors\.sale_voided_not_editable/);
  });

  it('TC-SL-31 refuses a total below what was already collected', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(2)], amountPaid: 60 }));
    await expect(
      saleService.updateSale(sale, {
        items: [productLine(1)], customerId: 'cust-1', branchId: null,
        currency: null, notes: null, actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/errors\.sale_total_below_collected/);
  });

  it('TC-SL-32 re-pricing gives the sale`s OWN units back before the stock check', async () => {
    stockOnHand['prod-1'] = 1;
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 0 }));
    // The shelf is empty now, but the sale is holding the unit it wants to keep.
    stockOnHand['prod-1'] = 0;
    await expect(
      saleService.updateSale(sale, {
        items: [productLine(1, 35)], customerId: 'cust-1', branchId: null,
        currency: null, notes: null, actorUserId: 'user-1',
      }),
    ).resolves.toBeTruthy();
  });

  it('TC-SL-33 an unchanged stock footprint leaves the ledger alone', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(2)], amountPaid: 0 }));
    const before = saleStore.movements.length;
    await saleService.updateSale(sale, {
      items: [productLine(2, 35)], customerId: 'cust-1', branchId: null,
      currency: null, notes: 'fixed a typo', actorUserId: 'user-1',
    });
    expect(saleStore.movements).toHaveLength(before);
  });

  it('TC-SL-34 splitting one line into two moves no stock', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(3)], amountPaid: 0 }));
    const before = saleStore.movements.length;
    await saleService.updateSale(sale, {
      items: [productLine(1), productLine(2)], customerId: 'cust-1', branchId: null,
      currency: null, notes: null, actorUserId: 'user-1',
    });
    expect(saleStore.movements).toHaveLength(before);
  });

  it('TC-SL-35 collectNow is capped at what is still owed', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 10 }));
    await expect(
      saleService.updateSale(sale, {
        items: [productLine(1)], customerId: 'cust-1', branchId: null,
        currency: null, notes: null, actorUserId: 'user-1', collectNow: 25,
      }),
    ).rejects.toThrow(/errors\.collect_exceeds_balance/);
  });

  it('TC-SL-36 collectNow writes a NEW hand-over and never edits the old one', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 10 }));
    const updated = await saleService.updateSale(sale, {
      items: [productLine(1)], customerId: 'cust-1', branchId: null,
      currency: null, notes: null, actorUserId: 'user-2', collectNow: 20,
    });
    expect(store.collections).toHaveLength(2);
    expect(store.collections[0].amount).toBe(10);
    expect(store.collections[1].amount).toBe(20);
    expect(updated.amountPaid).toBe(30);
  });

  it('TC-SL-37 a walk-in edit still has to be paid in full', async () => {
    const sale = await saleService.createSale(
      input({ customerId: null, items: [productLine(1)], amountPaid: 30 }),
    );
    await expect(
      saleService.updateSale(sale, {
        items: [productLine(2)], customerId: null, branchId: null,
        currency: null, notes: null, actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/errors\.sale_walkin_must_be_paid/);
  });

  it('TC-SL-38 REGRESSION: the currency may not move once money has been collected', async () => {
    // 30 USD collected. Switching the sale to LBP re-freezes the BILL's currency
    // while the hand-over stays in USD — a balance that can never close.
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 10 }));
    await expect(
      saleService.updateSale(sale, {
        items: [productLine(1, 2700000)], customerId: 'cust-1', branchId: null,
        currency: LBP, notes: null, actorUserId: 'user-1',
      }),
    ).rejects.toThrow();
  });
});

describe('voidSale', () => {
  it('TC-SL-40 takes the sale, its bill AND its cash', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 30 }));
    await saleService.voidSale(sale.id, 'user-1', 'returned');
    expect(saleStore.sale(sale.id)!.voided_at).not.toBeNull();
    expect(store.charges.find((c) => c.sale_id === sale.id)!.voided_at).not.toBeNull();
    expect(store.collections[0].voided_at).not.toBeNull();
  });

  it('TC-SL-41 voiding a PAID sale is allowed (the old refusal is gone)', async () => {
    const sale = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 30 }));
    await expect(saleService.voidSale(sale.id, 'user-1', 'returned')).resolves.toBeTruthy();
  });

  it('TC-SL-42 a bulk void undoes every sale`s cash in one pass', async () => {
    const a = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 30 }));
    const b = await saleService.createSale(input({ items: [productLine(1)], amountPaid: 30 }));
    const result = await saleService.voidSales([a.id, b.id], 'user-1', 'batch');
    expect(result.voided).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(store.collections.every((c) => c.voided_at !== null)).toBe(true);
  });
});
