jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { ledgerService } from '@/src/modules/ledger/services/LedgerService';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import { allocate } from '@/src/modules/ledger/utils/waterfall';
import type { CollectInput } from '@/src/modules/ledger/services/CollectionService';
import type { ChargeKind } from '@/src/core/types';
import { fakeChargeRepository, store } from '../helpers/fakeLedger';
import { customer, line, plan, LBP } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-IV-* — end-to-end money invariants. Each one is a property that must hold
// after ANY legal sequence of writes, not a single function's behaviour.

const P = plan({ id: 'p1', price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: 'line-1', startDate: '2026-01-01', planId: 'p1', plan: P });
const C = customer({ id: 'cust-1', customerPlans: [L] });

const owed = () =>
  ledgerService.getOwed({
    customer: C, lines: [L], skips: [], unpaidRule: 'month_start', currencies: [LBP],
  });

async function collectAll(amount: number, over: Partial<CollectInput> = {}) {
  const pool = await owed();
  const { lines, leftover } = allocate(amount, pool);
  expect(leftover).toBe(0);
  return collectionService.collect({
    tenantId: 't1', customerId: 'cust-1', branchId: null, amount,
    currencyId: null, ratePerUsdSnapshot: 1,
    receivedAt: '2026-03-20T10:00:00.000Z', receivedByUserId: 'user-1',
    notes: null, lines, ...over,
  });
}

/** Every hand-over's header equals the sum of its own items. */
function assertHeadersMatchSplits() {
  for (const col of store.collections) {
    const split = store.items
      .filter((i) => i.collection_id === col.id)
      .reduce((s, i) => s + i.amount, 0);
    expect(split).toBeCloseTo(col.amount, 8);
  }
}

/** No bill has ever taken more money than it asked for. */
async function assertNoNegativeBalances() {
  for (const c of store.charges) {
    const [b] = await fakeChargeRepository.balances([c.id]);
    if (!b) continue;
    expect(b.balance).toBeGreaterThanOrEqual(0);
  }
}

/** The grid for the viewed year, straight from the store. */
async function grid(year = 2026) {
  const bills = await chargeService.getMonthBillsForLines(['line-1']);
  return paymentService.buildMonthGrid(L, bills.get('line-1') ?? [], [], year);
}

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe('collect -> void -> the world is exactly as it was', () => {
  it('TC-IV-01 a voided hand-over leaves the month unpaid and the debts empty', async () => {
    const created = await collectAll(20);
    expect((await grid())[0].status).toBe('paid');

    await collectionService.voidCollection(created.id, 'user-1', 'wrong customer');

    const after = await grid();
    expect(after[0].status).toBe('unpaid');
    expect(after[0].collected).toBe(0);
    // The bill row survives (it owns the month's key) but reads like no bill.
    expect(store.charges).toHaveLength(1);
    const view = chargeService.buildDebtsView(await chargeService.getOpenCharges({ customerId: 'cust-1' }));
    expect(view.customers).toEqual([]);
    // ...and the money is out of every cash figure.
    expect(await collectionService.collectedInRange('2026-01-01', '2027-01-01', null)).toEqual([]);
  });

  it('TC-IV-02 re-collecting the emptied month is allowed and re-prices it', async () => {
    const created = await collectAll(20);
    await collectionService.voidCollection(created.id, 'user-1', null);
    await collectAll(20);
    expect((await grid())[0].status).toBe('paid');
    expect(store.charges).toHaveLength(1);
    await assertNoNegativeBalances();
  });
});

describe('the money always adds up', () => {
  it('TC-IV-10 the header equals its split, on every write', async () => {
    await collectAll(20);
    await collectAll(20);
    assertHeadersMatchSplits();
  });

  it('TC-IV-11 one hand-over over three bills is three settled rows, summing to it', async () => {
    store.seedCharge({
      id: 'sale', kind: 'sale', sale_id: 's1', customer_plan_id: null, billing_month: null,
      due_date: '2026-02-15', amount: 15,
    });
    const created = await collectAll(55); // Jan 20 + Feb 20 + the sale 15
    const rows = await collectionService.collectedInRange('2026-01-01', '2027-01-01', null);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(created.amount);
    // ...and the per-stream split adds to the same figure (gotcha #107).
    const of = (kind: ChargeKind) =>
      rows.filter((r) => r.stream === kind).reduce((s, r) => s + r.amount / r.ratePerUsdSnapshot, 0);
    expect(of('month') + of('sale') + of('manual')).toBeCloseTo(55, 10);
    expect(of('sale')).toBe(15);
  });

  it('TC-IV-12 a hand-over counts as ONE physical collection, however many bills it settled', async () => {
    await collectAll(40);
    const rows = await collectionService.collectedInRange('2026-01-01', '2027-01-01', null);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.collectionId)).size).toBe(1);
  });

  it('TC-IV-13 no balance can go negative through the collect path', async () => {
    await collectAll(60); // exactly Jan + Feb + Mar
    await assertNoNegativeBalances();
    // ...and there is nothing left to collect.
    expect(await owed()).toEqual([]);
  });

  it('TC-IV-14 an overpay is refused, so unapplied cash can never exist', async () => {
    const pool = await owed();
    const { lines } = allocate(60, pool);
    await expect(
      collectionService.collect({
        tenantId: 't1', customerId: 'cust-1', branchId: null, amount: 100,
        currencyId: null, ratePerUsdSnapshot: 1, receivedAt: '2026-03-20T10:00:00.000Z',
        receivedByUserId: 'user-1', notes: null, lines,
      }),
    ).rejects.toThrow(/errors\.collect_split_mismatch/);
    expect(store.collections).toHaveLength(0);
  });
});

describe('partial payments', () => {
  it('TC-IV-20 a part payment settles the month visually and leaves a real debt', async () => {
    await collectAll(25); // Jan in full, 5 against Feb
    const g = await grid();
    expect(g[0].status).toBe('paid');
    expect(g[0].balance).toBe(0);
    expect(g[1].status).toBe('paid');
    expect(g[1].balance).toBe(15);

    const view = chargeService.buildDebtsView(
      await chargeService.getOpenCharges({ customerId: 'cust-1' }),
    );
    // Feb is now a real debt (partly paid); January is settled and gone.
    expect(view.summary.monthsUsd).toBe(15);
    expect(view.customers[0].items).toHaveLength(1);
  });

  it('TC-IV-21 the remainder enters revenue in the month it is COLLECTED', async () => {
    await collectAll(25, { receivedAt: '2026-03-20T10:00:00.000Z' });
    const pool = await owed();
    const { lines } = allocate(15, pool);
    await collectionService.collect({
      tenantId: 't1', customerId: 'cust-1', branchId: null, amount: 15,
      currencyId: null, ratePerUsdSnapshot: 1, receivedAt: '2026-04-05T10:00:00.000Z',
      receivedByUserId: 'user-1', notes: null, lines,
    });
    const march = await collectionService.collectedInRange('2026-03-01', '2026-04-01', null);
    const april = await collectionService.collectedInRange('2026-04-01', '2026-05-01', null);
    expect(march.reduce((s, r) => s + r.amount, 0)).toBe(25);
    expect(april.reduce((s, r) => s + r.amount, 0)).toBe(15);
  });
});

describe('voiding a BILL takes its cash with it', () => {
  it('TC-IV-30 the month goes back to unpaid and the money leaves every figure', async () => {
    await collectAll(20);
    const bill = store.charges[0];
    await chargeService.voidChargeWithPayments(bill.id, 'user-1', 'never billed');

    expect((await grid())[0].status).toBe('unpaid');
    expect(await collectionService.collectedInRange('2026-01-01', '2027-01-01', null)).toEqual([]);
    expect(store.collections.every((c) => c.voided_at !== null)).toBe(true);
  });

  it('TC-IV-31 a SHARED hand-over un-pays the other month too - the documented cost', async () => {
    await collectAll(40); // Jan + Feb in ONE hand-over
    const jan = store.charges.find((c) => c.billing_month === '2026-01-01')!;
    await chargeService.voidChargeWithPayments(jan.id, 'user-1', null);

    const g = await grid();
    expect(g[0].status).toBe('unpaid'); // voided outright
    expect(g[1].status).toBe('unpaid'); // lost its share of the hand-over
    // February's BILL is still live and still owed — only its money went.
    const feb = store.charges.find((c) => c.billing_month === '2026-02-01')!;
    expect(feb.voided_at).toBeNull();
    const pool = await owed();
    expect(pool.some((i) => i.billingMonth === '2026-02-01')).toBe(true);
  });
});

describe('multi-month bundles', () => {
  const quarterly = line({
    id: 'line-1', startDate: '2026-01-01', planId: 'p3',
    plan: plan({ id: 'p3', price: 60, durationMonths: 3 }),
  });
  const quarterlyOwed = () =>
    ledgerService.getOwed({
      customer: customer({ id: 'cust-1', customerPlans: [quarterly] }),
      lines: [quarterly], skips: [], unpaidRule: 'month_start', currencies: [LBP],
    });

  it('TC-IV-40 one bundle bill covers three months and is collected once', async () => {
    const pool = await quarterlyOwed();
    // The grid offers each unpaid month; the panel collapses them to the block.
    const jan = pool.find((i) => i.billingMonth === '2026-01-01')!;
    await collectionService.collect({
      tenantId: 't1', customerId: 'cust-1', branchId: null, amount: 60,
      currencyId: null, ratePerUsdSnapshot: 1, receivedAt: '2026-03-20T10:00:00.000Z',
      receivedByUserId: 'user-1', notes: null,
      lines: [{ item: { ...jan, durationMonths: 3 }, amount: 60, settles: true }],
    });
    const bills = await chargeService.getMonthBillsForLines(['line-1']);
    const g = paymentService.buildMonthGrid(quarterly, bills.get('line-1') ?? [], [], 2026);
    expect(g.slice(0, 3).map((m) => m.status)).toEqual(['paid', 'paid', 'paid']);
    expect(store.charges).toHaveLength(1);
    // The money is counted once, not three times.
    const rows = await collectionService.collectedInRange('2026-01-01', '2027-01-01', null);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(60);
  });
});

describe('two devices, one month', () => {
  it('TC-IV-50 the deterministic id makes both writes land on ONE bill', async () => {
    const a = (await owed()).find((i) => i.billingMonth === '2026-01-01')!;
    await collectionService.collect({
      tenantId: 't1', customerId: 'cust-1', branchId: null, amount: 10,
      currencyId: null, ratePerUsdSnapshot: 1, receivedAt: '2026-03-20T10:00:00.000Z',
      receivedByUserId: 'user-1', notes: null,
      lines: [{ item: a, amount: 10, settles: false }],
    });
    // The second device still holds the pre-sync item: no chargeId at all.
    await collectionService.collect({
      tenantId: 't1', customerId: 'cust-1', branchId: null, amount: 10,
      currencyId: null, ratePerUsdSnapshot: 1, receivedAt: '2026-03-20T11:00:00.000Z',
      receivedByUserId: 'user-2', notes: null,
      lines: [{ item: a, amount: 10, settles: false }],
    });
    const janBills = store.charges.filter((c) => c.billing_month === '2026-01-01');
    expect(janBills).toHaveLength(1);
    const [balance] = await fakeChargeRepository.balances([janBills[0].id]);
    expect(balance.paid).toBe(20);
    expect(balance.balance).toBe(0);
  });
});
