jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import type { CollectInput } from '@/src/modules/ledger/services/CollectionService';
import type { AllocationLine, OpenItem } from '@/src/core/types';
import { collectionPlanId } from '@/src/modules/ledger/utils/collectionPlan';
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

  it('TC-CL-18 a bill raised under ANOTHER id is reused, not duplicated (#114)', async () => {
    const legacy = store.seedCharge({
      id: 'raised-elsewhere', customer_plan_id: 'line-1', billing_month: '2026-04-01',
      amount: 20, due_date: '2026-04-01',
    });
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 20, balance: 20, dueDate: '2026-04-01',
    });
    const created = await collectionService.collect(input({ lines: [lineOf(virtual, 20)] }));
    expect(store.charges.filter((c) => c.billing_month === '2026-04-01')).toHaveLength(1);
    expect(created.items![0].chargeId).toBe(legacy.id);
    expect((await fakeBalance(legacy.id)).paid).toBe(20);
  });

  it('TC-CL-19 a month whose deterministic id belongs to another bill gets a fresh one', async () => {
    const taken = await chargeService.monthChargeId('line-1', '2026-04-01');
    const unrelated = store.seedCharge({
      id: taken, customer_plan_id: 'line-2', billing_month: '2026-05-01',
      amount: 99, due_date: '2026-05-01',
    });
    const virtual = openItem({
      chargeId: null, customerPlanId: 'line-1', billingMonth: '2026-04-01',
      amount: 20, balance: 20, dueDate: '2026-04-01',
    });
    const created = await collectionService.collect(input({ lines: [lineOf(virtual, 20)] }));
    const raised = store.charges.find((c) => c.billing_month === '2026-04-01')!;
    expect(raised.id).not.toBe(taken);
    expect(created.items![0].chargeId).toBe(raised.id);
    expect(store.charge(unrelated.id)!.amount).toBe(99);
    expect((await fakeBalance(unrelated.id)).paid).toBe(0);
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

describe('what the cash paid for', () => {
  const kindOfRow = (id: string) => store.collections.find((c) => c.id === id)?.kind;

  it('TC-CL-50 freezes ONE kind when every bill it settles agrees', async () => {
    store.seedCharge({ id: 'chg-a', amount: 10 });
    store.seedCharge({ id: 'chg-b', amount: 10 });
    const row = await collectionService.collect(
      input({
        amount: 20,
        lines: [
          lineOf(openItem({ chargeId: 'chg-a', amount: 10 }), 10),
          lineOf(openItem({ chargeId: 'chg-b', amount: 10 }), 10),
        ],
      }),
    );
    expect(kindOfRow(row.id)).toBe('month');
  });

  it('TC-CL-51 freezes it as mixed when one hand-over settles two kinds', async () => {
    store.seedCharge({ id: 'chg-m', amount: 10 });
    store.seedCharge({ id: 'chg-s', amount: 10, kind: 'sale' });
    const row = await collectionService.collect(
      input({
        amount: 20,
        lines: [
          lineOf(openItem({ chargeId: 'chg-m', amount: 10 }), 10),
          lineOf(openItem({ chargeId: 'chg-s', kind: 'sale', amount: 10 }), 10),
        ],
      }),
    );
    expect(kindOfRow(row.id)).toBe('mixed');
  });

  it('TC-CL-52 a row written before the column reports its kind, derived', async () => {
    const chg = store.seedCharge({ amount: 10, kind: 'sale' });
    const old = store.seedCollection(chg.id, 10);
    expect(old.kind).toBeNull();
    const [listed] = await collectionService.getHistory({});
    expect(listed.kind).toBe('sale');
  });

  it('TC-CL-53 the type filter reads the frozen kind, and mixed is its own type', async () => {
    const month = store.seedCharge({ id: 'f-m', amount: 10 });
    store.seedCollection(month.id, 10, { id: 'only-month', kind: 'month' });
    store.seedCharge({ id: 'f-s', amount: 10, kind: 'sale' });
    store.seedCollection('f-s', 10, { id: 'a-mix', kind: 'mixed' });

    const months = await collectionService.getHistory({ kind: 'month' });
    expect(months.map((c) => c.id)).toEqual(['only-month']);
    const mixed = await collectionService.getHistory({ kind: 'mixed' });
    expect(mixed.map((c) => c.id)).toEqual(['a-mix']);
  });

  it('TC-CL-54 the history can be read oldest first, and voided rows on their own', async () => {
    const chg = store.seedCharge({ amount: 30 });
    store.seedCollection(chg.id, 10, { id: 'c1', received_at: '2026-02-01T00:00:00.000Z' });
    store.seedCollection(chg.id, 10, { id: 'c2', received_at: '2026-03-01T00:00:00.000Z' });
    const dead = store.seedCollection(chg.id, 10, {
      id: 'c3',
      received_at: '2026-04-01T00:00:00.000Z',
    });
    await collectionService.voidCollection(dead.id, 'user-1', null);

    const oldestFirst = await collectionService.getHistory({ sortDirection: 'asc' });
    expect(oldestFirst.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    const onlyVoided = await collectionService.getHistory({ voidedOnly: true });
    expect(onlyVoided.map((c) => c.id)).toEqual(['c3']);
  });

  it('TC-CL-55 the RECEIVED date and the RECORDED date are different orders', async () => {
    const chg = store.seedCharge({ amount: 40 });
    // Cash that arrived in January but was only entered into the app in February.
    store.seedCollection(chg.id, 10, {
      id: 'backdated',
      received_at: '2026-01-05T10:00:00.000Z',
      created_at: '2026-02-10T10:00:00.000Z',
      updated_at: '2026-02-10T10:00:00.000Z',
    });
    store.seedCollection(chg.id, 10, {
      id: 'same-day',
      received_at: '2026-02-01T10:00:00.000Z',
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.000Z',
    });

    const byReceived = await collectionService.getHistory({ sortField: 'received_at' });
    expect(byReceived.map((c) => c.id)).toEqual(['same-day', 'backdated']);
    const byRecorded = await collectionService.getHistory({ sortField: 'created_at' });
    expect(byRecorded.map((c) => c.id)).toEqual(['backdated', 'same-day']);
  });

  it('TC-CL-56 last-updated order surfaces the row a void just touched', async () => {
    const chg = store.seedCharge({ amount: 40 });
    const stale = store.seedCollection(chg.id, 10, {
      id: 'oldest',
      received_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    store.seedCollection(chg.id, 10, {
      id: 'newest',
      received_at: '2026-03-01T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    });
    await collectionService.voidCollection(stale.id, 'user-1', null);

    const byReceived = await collectionService.getHistory({ sortField: 'received_at' });
    expect(byReceived[0].id).toBe('newest');
    const byUpdated = await collectionService.getHistory({ sortField: 'updated_at' });
    expect(byUpdated[0].id).toBe('oldest');
  });

  it('TC-CL-57 names the one plan every bill it settled shares', () => {
    expect(collectionPlanId(['plan-1', 'plan-1'])).toBe('plan-1');
    expect(collectionPlanId(['plan-1'])).toBe('plan-1');
  });

  it('TC-CL-58 names no plan when the bills belong to two of them', () => {
    expect(collectionPlanId(['plan-1', 'plan-2'])).toBeNull();
  });

  it('TC-CL-59 a bill with no plan of its own leaves the hand-over unnamed', () => {
    expect(collectionPlanId(['plan-1', null])).toBeNull();
    expect(collectionPlanId([null, 'plan-1'])).toBeNull();
    expect(collectionPlanId([null, undefined])).toBeNull();
    expect(collectionPlanId([])).toBeNull();
  });
});

describe('a bill`s payments list', () => {
  it('TC-CL-40 lists every hand-over newest first, voided ones marked not dropped', async () => {
    const chg = store.seedCharge({ amount: 60 });
    store.seedCollection(chg.id, 20, { id: 'c-late', received_at: '2026-03-01T00:00:00.000Z' });
    store.seedCollection(chg.id, 20, { id: 'c-early', received_at: '2026-02-01T00:00:00.000Z' });
    const dead = store.seedCollection(chg.id, 20, { id: 'c-dead', received_at: '2026-01-01T00:00:00.000Z' });
    await collectionService.voidCollection(dead.id, 'user-1', null);
    const payments = await collectionService.getPaymentsForCharge(chg.id);
    expect(payments.map((p) => p.id)).toEqual(['c-late', 'c-early', 'c-dead']);
    expect(payments.find((p) => p.id === 'c-dead')?.voidedAt).not.toBeNull();
  });

  it('TC-CL-41 a voided bill still shows the money the void took away', async () => {
    const chg = store.seedCharge({ amount: 40 });
    store.seedCollection(chg.id, 40, { id: 'c-gone' });
    await chargeService.voidChargeWithPayments(chg.id, 'user-1', 'wrong bill');
    const payments = await collectionService.getPaymentsForCharge(chg.id);
    expect(payments.map((p) => p.id)).toEqual(['c-gone']);
    expect(payments[0].voidedAt).not.toBeNull();
    expect(await fakeBalance(chg.id)).toBeUndefined();
  });
});

describe('unpayCharge', () => {
  const live = () => store.collections.filter((c) => c.voided_at === null);

  it('TC-CL-60 voids the hand-over and reports what it took off the bill', async () => {
    const chg = store.seedCharge({ id: 'chg-solo', amount: 40 });
    store.seedCollection(chg.id, 40, { id: 'c-solo' });
    const result = await collectionService.unpayCharge(chg.id, 'user-1', 'corrected');
    expect(result.amount).toBe(40);
    expect(result.receivedAt).toBe('2026-02-01T10:00:00.000Z');
    expect(live()).toHaveLength(0);
    expect(await fakeBalance(chg.id)).toMatchObject({ paid: 0 });
  });

  it('TC-CL-61 a SHARED hand-over is rebuilt, leaving the other bill paid', async () => {
    store.seedCharge({ id: 'chg-x', amount: 10 });
    store.seedCharge({ id: 'chg-y', amount: 10 });
    await collectionService.collect(
      input({
        amount: 20,
        lines: [
          lineOf(openItem({ chargeId: 'chg-x', amount: 10 }), 10),
          lineOf(openItem({ chargeId: 'chg-y', amount: 10 }), 10),
        ],
      }),
    );
    const result = await collectionService.unpayCharge('chg-x', 'user-1', 'corrected');
    expect(result.amount).toBe(10);
    expect(live()).toHaveLength(1);
    expect(live()[0].amount).toBe(10);
    expect(live()[0].received_at).toBe('2026-02-01T10:00:00.000Z');
    expect(await fakeBalance('chg-x')).toMatchObject({ paid: 0 });
    expect(await fakeBalance('chg-y')).toMatchObject({ paid: 10 });
  });

  it('TC-CL-62 a bill nobody has paid is a no-op', async () => {
    const chg = store.seedCharge({ id: 'chg-free', amount: 40 });
    const result = await collectionService.unpayCharge(chg.id, 'user-1', null);
    expect(result).toEqual({
      amount: 0,
      receivedAt: null,
      receivedByUserId: null,
      branchId: null,
    });
    expect(store.collections).toHaveLength(0);
  });
});

async function fakeBalance(chargeId: string) {
  const { fakeChargeRepository } = require('../helpers/fakeLedger');
  const [b] = await fakeChargeRepository.balances([chargeId]);
  return b;
}
