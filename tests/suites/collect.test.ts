jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import type { CollectInput } from '@/src/modules/ledger/services/CollectionService';
import type { AllocationLine, OpenItem } from '@/src/core/types';
import { store } from '../helpers/fakeLedger';
import { openItem } from '../helpers/factories';

// TC-CL-* — recording ONE hand-over of cash. This is the only write that takes
// money in the whole app, so every rule about currency, overpay and
// materialisation is enforced here or nowhere.

beforeEach(() => store.reset());

const lineOf = (item: OpenItem, amount: number): AllocationLine => ({
  item,
  amount,
  settles: amount >= item.balance,
});

function input(over: Partial<CollectInput> = {}): CollectInput {
  return {
    tenantId: 't1',
    customerId: 'cust-1',
    branchId: null,
    amount: 20,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    receivedAt: '2026-02-01T10:00:00.000Z',
    receivedByUserId: 'user-1',
    notes: null,
    lines: [],
    ...over,
  };
}

describe('collect: refusals', () => {
  it('TC-CL-01 refuses a hand-over that pays nothing', async () => {
    await expect(collectionService.collect(input({ lines: [] })))
      .rejects.toThrow(/errors\.collect_no_lines/);
  });

  it('TC-CL-02 refuses a zero, negative or non-finite amount', async () => {
    const item = openItem({ chargeId: 'chg-1' });
    for (const amount of [0, -5, NaN, Infinity]) {
      await expect(
        collectionService.collect(input({ amount, lines: [lineOf(item, 20)] })),
      ).rejects.toThrow(/errors\.collect_amount_positive/);
    }
  });

  it('TC-CL-03 refuses a rate snapshot that is not positive', async () => {
    const item = openItem({ chargeId: 'chg-1' });
    await expect(
      collectionService.collect(
        input({ ratePerUsdSnapshot: 0, lines: [lineOf(item, 20)] }),
      ),
    ).rejects.toThrow(/errors\.rate_snapshot_positive/);
  });

  it('TC-CL-04 refuses a bill in a different currency than the cash', async () => {
    const lbp = openItem({ chargeId: 'chg-1', currencyId: 'cur-lbp' });
    await expect(
      collectionService.collect(input({ currencyId: null, lines: [lineOf(lbp, 20)] })),
    ).rejects.toThrow(/errors\.collect_currency_mismatch/);
  });

  it('TC-CL-05 refuses a line taking more than its bill still owes', async () => {
    const item = openItem({ chargeId: 'chg-1', amount: 20 });
    await expect(
      collectionService.collect(input({ amount: 25, lines: [lineOf(item, 25)] })),
    ).rejects.toThrow(/errors\.collect_exceeds_balance/);
  });

  it('TC-CL-06 refuses when the split does not equal the cash handed over', async () => {
    const a = openItem({ chargeId: 'a', amount: 20 });
    const b = openItem({ chargeId: 'b', amount: 20 });
    await expect(
      collectionService.collect(input({ amount: 40, lines: [lineOf(a, 20)] })),
    ).rejects.toThrow(/errors\.collect_split_mismatch/);
    await expect(
      collectionService.collect(
        input({ amount: 30, lines: [lineOf(a, 20), lineOf(b, 20)] }),
      ),
    ).rejects.toThrow(/errors\.collect_split_mismatch/);
  });

  it('TC-CL-07 refuses a line of zero', async () => {
    const item = openItem({ chargeId: 'chg-1' });
    await expect(
      collectionService.collect(input({ amount: 20, lines: [lineOf(item, 0), lineOf(openItem({ chargeId: 'x' }), 20)] })),
    ).rejects.toThrow(/errors\.collect_amount_positive/);
  });

  it('TC-CL-08 float dust does NOT trip the split check', async () => {
    store.seedCharge({ id: 'a', amount: 0.1 });
    store.seedCharge({ id: 'b', amount: 0.2 });
    const a = openItem({ chargeId: 'a', amount: 0.1 });
    const b = openItem({ chargeId: 'b', amount: 0.2 });
    await expect(
      collectionService.collect(
        input({ amount: 0.3, lines: [lineOf(a, 0.1), lineOf(b, 0.2)] }),
      ),
    ).resolves.toBeTruthy();
  });
});

describe('collect: the written rows', () => {
  it('TC-CL-10 the header equals the sum of its items', async () => {
    store.seedCharge({ id: 'a', amount: 20, billing_month: '2026-01-01' });
    store.seedCharge({ id: 'b', amount: 15, kind: 'sale', sale_id: 's1', customer_plan_id: null, billing_month: null });
    const a = openItem({ chargeId: 'a', amount: 20 });
    const b = openItem({ chargeId: 'b', kind: 'sale', amount: 15 });
    const created = await collectionService.collect(
      input({ amount: 35, lines: [lineOf(a, 20), lineOf(b, 15)] }),
    );
    expect(created.amount).toBe(35);
    expect(created.items!.reduce((s, i) => s + i.amount, 0)).toBe(35);
  });

  it('TC-CL-11 the cash starts in the receiving user`s wallet', async () => {
    store.seedCharge({ id: 'a', amount: 20 });
    const created = await collectionService.collect(
      input({ lines: [lineOf(openItem({ chargeId: 'a' }), 20)] }),
    );
    expect(created.heldByUserId).toBe('user-1');
    expect(created.remittedAt).toBeNull();
  });

  it('TC-CL-12 a VIRTUAL month raises its bill in the same write', async () => {
    const virtual = openItem({
      chargeId: null,
      customerPlanId: 'line-1',
      billingMonth: '2026-04-01',
      amount: 20,
      dueDate: '2026-04-01',
    });
    const created = await collectionService.collect(
      input({ lines: [lineOf(virtual, 20)] }),
    );
    expect(store.charges).toHaveLength(1);
    const raised = store.charges[0];
    expect(raised.kind).toBe('month');
    expect(raised.billing_month).toBe('2026-04-01');
    expect(raised.amount).toBe(20);
    // Owed since its billing day, raised now — ageing must read the due date.
    expect(raised.due_date).toBe('2026-04-01');
    expect(raised.issued_at > raised.due_date).toBe(true);
    expect(created.items![0].chargeId).toBe(raised.id);
  });

  it('TC-CL-13 the same month collected twice converges on ONE bill', async () => {
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 20, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ amount: 10, lines: [lineOf({ ...virtual, balance: 20 }, 10)] }));
    await collectionService.collect(input({ amount: 10, lines: [lineOf({ ...virtual, balance: 20 }, 10)] }));
    const monthBills = store.charges.filter((c) => c.billing_month === '2026-04-01');
    expect(monthBills).toHaveLength(1);
  });

  it('TC-CL-14 an existing bill money has REACHED keeps its frozen price', async () => {
    const existing = store.seedCharge({
      customer_plan_id: 'line-1', billing_month: '2026-04-01', amount: 20, due_date: '2026-04-01',
    });
    store.seedCollection(existing.id, 5);
    // The line's price went up to 25 since — the bill must not follow.
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 25, balance: 25, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ amount: 15, lines: [lineOf(virtual, 15)] }));
    expect(store.charge(existing.id)!.amount).toBe(20);
  });

  it('TC-CL-15 an EMPTY bill is re-priced from the line`s current price (#106b)', async () => {
    const existing = store.seedCharge({
      customer_plan_id: 'line-1', billing_month: '2026-04-01', amount: 20, due_date: '2026-04-01',
    });
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 25, balance: 25, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ amount: 25, lines: [lineOf(virtual, 25)] }));
    expect(store.charge(existing.id)!.amount).toBe(25);
  });

  it('TC-CL-16 cash REVIVES a voided bill before it lands on it (#115)', async () => {
    const dead = store.seedCharge({
      customer_plan_id: 'line-1', billing_month: '2026-04-01', amount: 20, due_date: '2026-04-01',
      voided_at: '2026-03-01T00:00:00.000Z', voided_by: 'user-1', void_reason: 'oops',
    });
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 20, balance: 20, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ lines: [lineOf(virtual, 20)] }));
    const revived = store.charge(dead.id)!;
    expect(revived.voided_at).toBeNull();
    expect(revived.void_reason).toBeNull();
    // The money must be visible: the bill is live and carries the item.
    expect(await collectionService.getPaymentsForCharge(revived.id)).toHaveLength(1);
  });

  it('TC-CL-17 cash also revives a WRITTEN-OFF bill (both statements are cleared)', async () => {
    const lost = store.seedCharge({
      customer_plan_id: 'line-1', billing_month: '2026-04-01', amount: 20, due_date: '2026-04-01',
      written_off_at: '2026-03-01T00:00:00.000Z', written_off_by: 'user-1', write_off_reason: 'gone',
    });
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 20, balance: 20, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ lines: [lineOf(virtual, 20)] }));
    expect(store.charge(lost.id)!.written_off_at).toBeNull();
  });
});

describe('collect: an OPEN month (a line with no set price)', () => {
  it('TC-CL-20 whatever is handed over becomes the bill, in the cash`s currency', async () => {
    const open = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 30, balance: 30, currencyId: 'cur-lbp', openAmount: true, dueDate: '2026-04-01',
    });
    await collectionService.collect(
      input({ amount: 30, currencyId: 'cur-lbp', ratePerUsdSnapshot: 90000, lines: [lineOf(open, 30)] }),
    );
    const raised = store.charges[0];
    expect(raised.amount).toBe(30);
    expect(raised.currency_id).toBe('cur-lbp');
    expect(raised.rate_per_usd_snapshot).toBe(90000);
  });

  it('TC-CL-21 an open month bypasses the currency-match rule', async () => {
    const open = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 30, balance: 30, currencyId: null, openAmount: true, dueDate: '2026-04-01',
    });
    await expect(
      collectionService.collect(
        input({ amount: 30, currencyId: 'cur-lbp', ratePerUsdSnapshot: 90000, lines: [lineOf(open, 30)] }),
      ),
    ).resolves.toBeTruthy();
  });

  it('TC-CL-22 a PART payment of an open month still bills the typed amount', async () => {
    const open = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 30, balance: 30, openAmount: true, dueDate: '2026-04-01',
    });
    await collectionService.collect(input({ amount: 10, lines: [lineOf(open, 10)] }));
    expect(store.charges[0].amount).toBe(30);
  });
});

describe('voiding a hand-over', () => {
  it('TC-CL-30 refuses a second void of the same row', async () => {
    const chg = store.seedCharge({ amount: 20 });
    const col = store.seedCollection(chg.id, 20);
    await collectionService.voidCollection(col.id, 'user-1', null);
    await expect(collectionService.voidCollection(col.id, 'user-1', null))
      .rejects.toThrow(/errors\.collection_already_voided/);
  });

  it('TC-CL-31 refuses an unknown row', async () => {
    await expect(collectionService.voidCollection('nope', 'user-1', null))
      .rejects.toThrow(/errors\.collection_not_found/);
  });

  it('TC-CL-32 the balance it settled comes back on its own', async () => {
    const chg = store.seedCharge({ amount: 20 });
    const col = store.seedCollection(chg.id, 20);
    expect((await fakeBalance(chg.id)).paid).toBe(20);
    await collectionService.voidCollection(col.id, 'user-1', null);
    expect((await fakeBalance(chg.id)).paid).toBe(0);
  });

  it('TC-CL-33 voidCollections skips an already-void row instead of throwing', async () => {
    const chg = store.seedCharge({ amount: 20 });
    const a = store.seedCollection(chg.id, 10);
    const b = store.seedCollection(chg.id, 10);
    await collectionService.voidCollection(a.id, 'user-1', null);
    const voided = await collectionService.voidCollections([a.id, b.id], 'user-1', 'batch');
    expect(voided.map((v) => v.id)).toEqual([b.id]);
  });
});

describe('a bill`s payments list', () => {
  it('TC-CL-40 lists live hand-overs oldest first and drops voided ones', async () => {
    const chg = store.seedCharge({ amount: 60 });
    store.seedCollection(chg.id, 20, { id: 'c-late', received_at: '2026-03-01T00:00:00.000Z' });
    store.seedCollection(chg.id, 20, { id: 'c-early', received_at: '2026-02-01T00:00:00.000Z' });
    const dead = store.seedCollection(chg.id, 20, { id: 'c-dead', received_at: '2026-01-01T00:00:00.000Z' });
    await collectionService.voidCollection(dead.id, 'user-1', null);
    const payments = await collectionService.getPaymentsForCharge(chg.id);
    expect(payments.map((p) => p.id)).toEqual(['c-early', 'c-late']);
  });
});

async function fakeBalance(chargeId: string) {
  const { fakeChargeRepository } = require('../helpers/fakeLedger');
  const [b] = await fakeChargeRepository.balances([chargeId]);
  return b;
}
