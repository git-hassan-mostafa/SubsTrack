import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import type { MonthEntry, MonthStatus } from '@/src/core/types';
import { bill, line, plan, skip } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-MG-* — buildMonthGrid, the single source of truth for month status.
// Rule #1 of the codebase: no other file may reimplement this, so every status
// question in the app ultimately resolves here.

const L = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ id: 'p1' }) });

function statuses(grid: MonthEntry[]): MonthStatus[] {
  return grid.map((m) => m.status);
}

function at(grid: MonthEntry[], month: number): MonthEntry {
  return grid[month - 1];
}

describe('buildMonthGrid: the status ladder', () => {
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  it('TC-MG-01 twelve entries, always, in calendar order', () => {
    const grid = paymentService.buildMonthGrid(L, [], [], 2026);
    expect(grid).toHaveLength(12);
    expect(grid.map((m) => m.billingMonth)).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01',
      '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01',
      '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01',
    ]);
  });

  it('TC-MG-02 months before the line start are before_start, never unpaid', () => {
    const later = line({ id: 'line-1', startDate: '2026-04-10' });
    const grid = paymentService.buildMonthGrid(later, [], [], 2026);
    expect(statuses(grid).slice(0, 3)).toEqual(['before_start', 'before_start', 'before_start']);
    expect(at(grid, 4).status).toBe('unpaid');
  });

  it('TC-MG-03 past + current months are unpaid, later months are future', () => {
    const grid = paymentService.buildMonthGrid(L, [], [], 2026);
    expect(statuses(grid)).toEqual([
      'unpaid', 'unpaid', 'unpaid', 'unpaid', 'unpaid', 'unpaid',
      'future', 'future', 'future', 'future', 'future', 'future',
    ]);
  });

  it('TC-MG-04 the current month is unpaid from day one (no grace period)', () => {
    freezeToday(2026, 6, 1);
    const grid = paymentService.buildMonthGrid(L, [], [], 2026);
    expect(at(grid, 6).status).toBe('unpaid');
  });

  it('TC-MG-05 money makes a month paid', () => {
    const grid = paymentService.buildMonthGrid(L, [bill('2026-03-01', 20)], [], 2026);
    expect(at(grid, 3).status).toBe('paid');
    expect(at(grid, 3).collected).toBe(20);
    expect(at(grid, 3).balance).toBe(0);
  });

  it('TC-MG-06 a PARTIAL payment still reports "paid", and carries the balance', () => {
    const grid = paymentService.buildMonthGrid(L, [bill('2026-03-01', 5)], [], 2026);
    expect(at(grid, 3).status).toBe('paid');
    expect(at(grid, 3).balance).toBe(15);
  });

  it('TC-MG-07 an EMPTY bill reads exactly like a month never touched (#106)', () => {
    const emptied = paymentService.buildMonthGrid(L, [bill('2026-03-01', 0)], [], 2026);
    const untouched = paymentService.buildMonthGrid(L, [], [], 2026);
    expect(at(emptied, 3).status).toBe(at(untouched, 3).status);
    expect(at(emptied, 3).collected).toBe(0);
    expect(at(emptied, 3).balance).toBe(0);
  });

  it('TC-MG-08 money outranks a skip', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [bill('2026-03-01', 20)],
      [skip('2026-03-01')],
      2026,
    );
    expect(at(grid, 3).status).toBe('paid');
    expect(at(grid, 3).skip).toBeNull();
  });

  it('TC-MG-09 a skip outranks future and unpaid, and carries its row', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [],
      [skip('2026-03-01'), skip('2026-09-01')],
      2026,
    );
    expect(at(grid, 3).status).toBe('skipped');
    expect(at(grid, 3).skip?.billingMonth).toBe('2026-03-01');
    expect(at(grid, 9).status).toBe('skipped');
  });

  it('TC-MG-10 an UNSKIPPED row (skipped=false) is not a skip', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [],
      [skip('2026-03-01', { skipped: false })],
      2026,
    );
    expect(at(grid, 3).status).toBe('unpaid');
  });

  it('TC-MG-11 before_start beats everything, including a paid bill', () => {
    const later = line({ id: 'line-1', startDate: '2026-05-01' });
    const grid = paymentService.buildMonthGrid(later, [bill('2026-02-01', 20)], [], 2026);
    expect(at(grid, 2).status).toBe('before_start');
    expect(at(grid, 2).collected).toBe(0);
  });
});

describe('buildMonthGrid: multi-month bills', () => {
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  it('TC-MG-20 a 3-month bill covers three months, only the first is primary', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [bill('2026-02-01', 60, { durationMonths: 3, amount: 60 })],
      [],
      2026,
    );
    expect(statuses(grid).slice(1, 4)).toEqual(['paid', 'paid', 'paid']);
    expect(at(grid, 2).isGroupSecondary).toBe(false);
    expect(at(grid, 3).isGroupSecondary).toBe(true);
    expect(at(grid, 4).isGroupSecondary).toBe(true);
  });

  it('TC-MG-21 a block straddling the year end paints both years', () => {
    const bundle = bill('2025-11-01', 60, { durationMonths: 3, amount: 60 });
    const l2025 = line({ id: 'line-1', startDate: '2025-01-01' });
    const g2025 = paymentService.buildMonthGrid(l2025, [bundle], [], 2025);
    const g2026 = paymentService.buildMonthGrid(l2025, [bundle], [], 2026);
    expect(at(g2025, 11).status).toBe('paid');
    expect(at(g2025, 12).status).toBe('paid');
    expect(at(g2026, 1).status).toBe('paid');
    expect(at(g2026, 1).isGroupSecondary).toBe(true);
    expect(at(g2026, 2).status).toBe('unpaid');
  });

  it('TC-MG-22 a partly-paid bundle shows every covered month as paid', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [bill('2026-02-01', 10, { durationMonths: 3, amount: 60 })],
      [],
      2026,
    );
    expect(statuses(grid).slice(1, 4)).toEqual(['paid', 'paid', 'paid']);
    expect(at(grid, 2).balance).toBe(50);
    // Every covered month points at the SAME bill, so the balance is not tripled.
    expect(at(grid, 3).charge?.id).toBe(at(grid, 2).charge?.id);
  });

  it('TC-MG-23 an EMPTY bundle covers nothing (money decides, not the row)', () => {
    const grid = paymentService.buildMonthGrid(
      L,
      [bill('2026-02-01', 0, { durationMonths: 3, amount: 60 })],
      [],
      2026,
    );
    expect(statuses(grid).slice(1, 4)).toEqual(['unpaid', 'unpaid', 'unpaid']);
  });
});

describe('buildMonthGrid: the customer_start_day rule', () => {
  afterEach(unfreeze);

  it('TC-MG-30 under month_start, the current month is red on day 1', () => {
    freezeToday(2026, 6, 1);
    const l = line({ id: 'line-1', startDate: '2026-01-15' });
    expect(at(paymentService.buildMonthGrid(l, [], [], 2026, 'month_start'), 6).status)
      .toBe('unpaid');
  });

  it('TC-MG-31 under customer_start_day, the current month waits for the billing day', () => {
    freezeToday(2026, 6, 10);
    const l = line({ id: 'line-1', startDate: '2026-01-15' });
    const grid = paymentService.buildMonthGrid(l, [], [], 2026, 'customer_start_day');
    // Not due yet -> reported as "future" so it stays payable but owes nothing.
    expect(at(grid, 6).status).toBe('future');
    // ...and a PAST month is red on sight, whatever the rule.
    expect(at(grid, 5).status).toBe('unpaid');
  });

  it('TC-MG-32 on the billing day itself the current month turns red', () => {
    freezeToday(2026, 6, 15);
    const l = line({ id: 'line-1', startDate: '2026-01-15' });
    expect(at(paymentService.buildMonthGrid(l, [], [], 2026, 'customer_start_day'), 6).status)
      .toBe('unpaid');
  });

  it('TC-MG-33 a 31st start clamps to the last day of a short month', () => {
    freezeToday(2026, 2, 28);
    const l = line({ id: 'line-1', startDate: '2026-01-31' });
    // Feb has 28 days in 2026, so the 31st clamps to the 28th and the month IS due.
    expect(at(paymentService.buildMonthGrid(l, [], [], 2026, 'customer_start_day'), 2).status)
      .toBe('unpaid');
  });

  it('TC-MG-34 the rule never touches a FUTURE month', () => {
    freezeToday(2026, 6, 1);
    const l = line({ id: 'line-1', startDate: '2026-01-15' });
    const grid = paymentService.buildMonthGrid(l, [], [], 2026, 'customer_start_day');
    expect(at(grid, 7).status).toBe('future');
  });
});

describe('buildMonthGrid: purity', () => {
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  it('TC-MG-40 the same inputs give the same grid twice (no hidden I/O)', () => {
    const bills = [bill('2026-02-01', 20)];
    const a = paymentService.buildMonthGrid(L, bills, [], 2026);
    const b = paymentService.buildMonthGrid(L, bills, [], 2026);
    expect(a).toEqual(b);
  });

  it('TC-MG-41 it does not mutate the bills it is given', () => {
    const bills = [bill('2026-02-01', 20)];
    const snapshot = JSON.parse(JSON.stringify(bills));
    paymentService.buildMonthGrid(L, bills, [], 2026);
    expect(bills).toEqual(snapshot);
  });
});
