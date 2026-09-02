jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import { ledgerService } from '@/src/modules/ledger/services/LedgerService';
import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { store } from '../helpers/fakeLedger';
import { customer, line, plan, skip, LBP } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-OW-* — "what does this customer owe?". Two sources only this layer can see:
// STORED bills, and VIRTUAL months that have no row until money reaches them.

const P = plan({ id: 'p1', price: 20, currencyId: null, durationMonths: 1 });
const L = line({ id: 'line-1', startDate: '2026-01-01', planId: 'p1', plan: P });
const C = customer({ id: 'cust-1', customerPlans: [L] });

const owedFor = (lines = [L], skips = [] as ReturnType<typeof skip>[]) =>
  ledgerService.getOwed({ customer: C, lines, skips, unpaidRule: 'month_start', currencies: [LBP] });

beforeEach(() => {
  store.reset();
  freezeToday(2026, 3, 15);
});
afterEach(unfreeze);

describe('getOwed: virtual months', () => {
  it('TC-OW-01 an untouched unpaid month is owed even with no bill row', async () => {
    const owed = await owedFor();
    expect(owed.map((i) => i.billingMonth)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(owed.every((i) => i.chargeId === null)).toBe(true);
    expect(owed.every((i) => i.amount === 20)).toBe(true);
  });

  it('TC-OW-02 an unpaid month is OWED but is NOT a debt', async () => {
    const owed = await owedFor();
    expect(owed.every((i) => i.isDebt === false)).toBe(true);
  });

  it('TC-OW-03 future and skipped months are never owed', async () => {
    const owed = await owedFor([L], [skip('2026-02-01')]);
    expect(owed.map((i) => i.billingMonth)).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('TC-OW-04 a line with NO fixed price never joins the waterfall (#112)', async () => {
    const typed = line({
      id: 'line-1', startDate: '2026-01-01',
      plan: plan({ id: 'p2', isCustomPrice: true, price: 0 }),
    });
    expect(await owedFor([typed])).toEqual([]);
  });

  it('TC-OW-05 an inactive line owes nothing', async () => {
    expect(await owedFor([line({ ...L, active: false })])).toEqual([]);
  });

  it('TC-OW-06 a virtual month is valued at the currency`s CURRENT rate', async () => {
    const lbpLine = line({
      id: 'line-1', startDate: '2026-03-01',
      plan: plan({ id: 'p3', price: 900000, currencyId: LBP.id }),
    });
    const [item] = await owedFor([lbpLine]);
    expect(item.currencyId).toBe(LBP.id);
    expect(item.ratePerUsdSnapshot).toBe(90000);
  });
});

describe('getOwed: the dedupe between stored and virtual', () => {
  it('TC-OW-10 a PAID stored bill wins, and keeps its frozen price', async () => {
    store.seedCharge({
      id: 'chg-jan', customer_plan_id: 'line-1', billing_month: '2026-01-01',
      due_date: '2026-01-01', amount: 30,
    });
    store.seedCollection('chg-jan', 10);
    const owed = await owedFor();
    const jan = owed.filter((i) => i.billingMonth === '2026-01-01');
    expect(jan).toHaveLength(1);
    expect(jan[0].chargeId).toBe('chg-jan');
    expect(jan[0].amount).toBe(30); // frozen, not the line's 20
    expect(jan[0].balance).toBe(20);
    expect(jan[0].isDebt).toBe(true); // partly paid -> a real debt
  });

  it('TC-OW-11 an EMPTY stored bill LOSES to the virtual month and is re-priced (#106b)', async () => {
    store.seedCharge({
      id: 'chg-jan', customer_plan_id: 'line-1', billing_month: '2026-01-01',
      due_date: '2026-01-01', amount: 30,
    });
    const owed = await owedFor();
    const jan = owed.filter((i) => i.billingMonth === '2026-01-01');
    expect(jan).toHaveLength(1);
    expect(jan[0].chargeId).toBeNull();
    expect(jan[0].amount).toBe(20); // the line's CURRENT price
  });

  it('TC-OW-12 a month is never listed twice', async () => {
    store.seedCharge({
      id: 'chg-feb', customer_plan_id: 'line-1', billing_month: '2026-02-01',
      due_date: '2026-02-01', amount: 20,
    });
    const owed = await owedFor();
    const months = owed.map((i) => i.billingMonth);
    expect(new Set(months).size).toBe(months.length);
  });
});

describe('getOwed: other kinds', () => {
  it('TC-OW-20 a sale debt and a custom fee are debts from day one', async () => {
    store.seedCharge({
      id: 'chg-sale', kind: 'sale', sale_id: 's1', customer_plan_id: null,
      billing_month: null, due_date: '2026-02-10', amount: 15,
    });
    store.seedCharge({
      id: 'chg-fee', kind: 'manual', customer_plan_id: null, billing_month: null,
      description: 'Installation', due_date: '2026-02-20', amount: 5,
    });
    const owed = await owedFor();
    const debts = owed.filter((i) => i.isDebt);
    expect(debts.map((i) => i.chargeId).sort()).toEqual(['chg-fee', 'chg-sale']);
  });

  it('TC-OW-21 everything comes back oldest DUE DATE first', async () => {
    store.seedCharge({
      id: 'chg-old', kind: 'manual', customer_plan_id: null, billing_month: null,
      description: 'Old fee', due_date: '2025-06-01', amount: 5,
    });
    const owed = await owedFor();
    expect(owed[0].chargeId).toBe('chg-old');
  });

  it('TC-OW-22 a voided or written-off bill is not owed', async () => {
    store.seedCharge({
      id: 'chg-void', kind: 'manual', customer_plan_id: null, billing_month: null,
      due_date: '2026-02-01', amount: 5, voided_at: '2026-02-02T00:00:00.000Z',
    });
    store.seedCharge({
      id: 'chg-off', kind: 'manual', customer_plan_id: null, billing_month: null,
      due_date: '2026-02-01', amount: 5, written_off_at: '2026-02-02T00:00:00.000Z',
    });
    const owed = await owedFor();
    expect(owed.map((i) => i.chargeId)).not.toContain('chg-void');
    expect(owed.map((i) => i.chargeId)).not.toContain('chg-off');
  });

  it('TC-OW-23 a fully settled bill is not owed', async () => {
    store.seedCharge({
      id: 'chg-paid', kind: 'sale', sale_id: 's1', customer_plan_id: null,
      billing_month: null, due_date: '2026-02-10', amount: 15,
    });
    store.seedCollection('chg-paid', 15);
    const owed = await owedFor();
    expect(owed.map((i) => i.chargeId)).not.toContain('chg-paid');
  });
});

describe('buildDebtsView', () => {
  it('TC-OW-30 a plain unpaid month never reaches the Debts screen (#106c)', async () => {
    store.seedCharge({
      id: 'chg-empty', customer_plan_id: 'line-1', billing_month: '2026-01-01',
      due_date: '2026-01-01', amount: 20,
    });
    const open = await chargeService.getOpenCharges({ customerId: 'cust-1' });
    const view = chargeService.buildDebtsView(open);
    expect(view.customers).toEqual([]);
    expect(view.summary.totalUsd).toBe(0);
  });

  it('TC-OW-31 the parts add up to the total exactly', async () => {
    store.seedCharge({
      id: 'm', customer_plan_id: 'line-1', billing_month: '2026-01-01',
      due_date: '2026-01-01', amount: 20,
    });
    store.seedCollection('m', 5);
    store.seedCharge({
      id: 's', kind: 'sale', sale_id: 's1', customer_plan_id: null, billing_month: null,
      due_date: '2026-01-10', amount: 15,
    });
    store.seedCharge({
      id: 'f', kind: 'manual', customer_plan_id: null, billing_month: null,
      due_date: '2026-01-20', amount: 5, description: 'Fee',
    });
    const view = chargeService.buildDebtsView(
      await chargeService.getOpenCharges({ customerId: 'cust-1' }),
    );
    const s = view.summary;
    expect(s.monthsUsd + s.salesUsd + s.manualUsd).toBeCloseTo(s.totalUsd, 10);
    expect(s.monthsUsd).toBe(15);
    expect(s.salesUsd).toBe(15);
    expect(s.manualUsd).toBe(5);
    expect(s.customerCount).toBe(1);
  });

  it('TC-OW-32 USD uses each row`s FROZEN rate, never today`s', async () => {
    store.seedCharge({
      id: 'f', kind: 'manual', customer_plan_id: null, billing_month: null,
      due_date: '2026-01-20', amount: 180000, currency_id: LBP.id,
      rate_per_usd_snapshot: 90000, description: 'Fee',
    });
    const view = chargeService.buildDebtsView(
      await chargeService.getOpenCharges({ customerId: 'cust-1' }),
    );
    expect(view.summary.totalUsd).toBeCloseTo(2, 10);
  });

  it('TC-OW-33 oldestDaysLate comes off the oldest DEBT', async () => {
    store.seedCharge({
      id: 'f', kind: 'manual', customer_plan_id: null, billing_month: null,
      due_date: '2026-03-05', amount: 5, description: 'Fee',
    });
    const view = chargeService.buildDebtsView(
      await chargeService.getOpenCharges({ customerId: 'cust-1' }),
    );
    expect(view.customers[0].oldestDaysLate).toBe(10);
  });
});
