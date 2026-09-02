import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import {
  customerFlags,
  hasDebtFlag,
} from '@/src/modules/customer/customers/utils/customerFlags';
import { bill, customer, line, plan, skip } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-CS-* — the customer-list badge. Five rules hold it together (gotcha #56);
// each one below is a rule the badge got wrong at some point.

const P = plan({ id: 'p1' });
const L1 = line({ id: 'line-1', startDate: '2026-01-01', plan: P });
const L2 = line({ id: 'line-2', startDate: '2026-01-01', plan: P });

const forLine = (lineId: string, months: string[]) =>
  months.map((m) => bill(m, 20, { customerPlanId: lineId }));

describe('buildCustomerStatus', () => {
  beforeEach(() => freezeToday(2026, 3, 15));
  afterEach(unfreeze);

  it('TC-CS-01 nothing paid at all -> unpaid + overdue', () => {
    const s = paymentService.buildCustomerStatus([L1], [], []);
    expect(s.status).toBe('unpaid');
    expect(s.overdue).toBe(true);
    expect(s.planCount).toEqual({ paid: 0, total: 1 });
  });

  it('TC-CS-02 every required month paid -> paid, and NEVER overdue', () => {
    const bills = forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01']);
    const s = paymentService.buildCustomerStatus([L1], bills, []);
    expect(s.status).toBe('paid');
    expect(s.overdue).toBe(false);
    expect(s.notDueLineIds).toEqual(['line-1']);
  });

  it('TC-CS-03 "Paid" and "Overdue" can never both show (rule 1)', () => {
    // Jan unpaid, Feb+Mar paid — a legacy shape the guards now prevent.
    const bills = forLine('line-1', ['2026-02-01', '2026-03-01']);
    const s = paymentService.buildCustomerStatus([L1], bills, []);
    expect(s.status).not.toBe('paid');
    expect(s.overdue).toBe(true);
    expect(customerFlags(s)).toEqual(['overdue']);
  });

  it('TC-CS-04 two lines, one settled -> mixed, with the plan count', () => {
    const bills = forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01']);
    const s = paymentService.buildCustomerStatus([L1, L2], bills, []);
    expect(s.status).toBe('mixed');
    expect(s.planCount).toEqual({ paid: 1, total: 2 });
    expect(s.overdue).toBe(true);
    expect(customerFlags(s)).toEqual(['mixed', 'overdue']);
  });

  it('TC-CS-05 a partial payment counts as covered', () => {
    const bills = [
      bill('2026-01-01', 5, { customerPlanId: 'line-1' }),
      bill('2026-02-01', 5, { customerPlanId: 'line-1' }),
      bill('2026-03-01', 5, { customerPlanId: 'line-1' }),
    ];
    const s = paymentService.buildCustomerStatus([L1], bills, []);
    expect(s.status).toBe('paid');
    expect(s.overdue).toBe(false);
  });

  it('TC-CS-06 every line skipped this month -> skipped, not unpaid', () => {
    const bills = forLine('line-1', ['2026-01-01', '2026-02-01']);
    const skips = [skip('2026-03-01', { customerPlanId: 'line-1' })];
    const s = paymentService.buildCustomerStatus([L1], bills, skips);
    expect(s.status).toBe('skipped');
    expect(s.overdue).toBe(false);
    expect(s.notDueLineIds).toEqual(['line-1']);
  });

  it('TC-CS-07 a skip excuses its OWN month, never a backlog', () => {
    const skips = [skip('2026-03-01', { customerPlanId: 'line-1' })];
    const s = paymentService.buildCustomerStatus([L1], [], skips);
    expect(s.status).toBe('unpaid');
    expect(s.overdue).toBe(true);
  });

  it('TC-CS-08 a line that has not started yet is not in play', () => {
    const later = line({ id: 'line-9', startDate: '2026-09-01', plan: P });
    const s = paymentService.buildCustomerStatus([later], [], []);
    expect(s.planCount).toEqual({ paid: 0, total: 0 });
    expect(s.status).toBe('not_due_yet');
    expect(s.overdue).toBe(false);
  });

  it('TC-CS-09 an inactive line is ignored entirely', () => {
    const dead = line({ id: 'line-dead', startDate: '2026-01-01', active: false, plan: P });
    const bills = forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01']);
    const s = paymentService.buildCustomerStatus([L1, dead], bills, []);
    expect(s.status).toBe('paid');
    expect(s.planCount).toEqual({ paid: 1, total: 1 });
  });

  it('TC-CS-10 uncoveredLineIds is what quick pay must skip', () => {
    const s = paymentService.buildCustomerStatus([L1, L2], forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01']), []);
    expect(s.uncoveredLineIds).toEqual(['line-2']);
    expect(s.notDueLineIds).toEqual(['line-1']);
  });

  it('TC-CS-11 under customer_start_day, last month blocks quick pay but is NOT overdue yet (#83)', () => {
    // Today 10 Mar, billing day the 15th. February is unpaid but not late yet.
    freezeToday(2026, 3, 10);
    const l = line({ id: 'line-1', startDate: '2026-02-15', plan: P });
    const s = paymentService.buildCustomerStatus([l], [], [], 'customer_start_day');
    expect(s.overdue).toBe(false);
    // ...but the hole is still a hole, so quick pay must skip the line.
    expect(s.uncoveredLineIds).toEqual(['line-1']);
  });

  it('TC-CS-12 after the billing day, the same customer reads Overdue', () => {
    freezeToday(2026, 3, 20);
    const l = line({ id: 'line-1', startDate: '2026-02-15', plan: P });
    const s = paymentService.buildCustomerStatus([l], [], [], 'customer_start_day');
    expect(s.overdue).toBe(true);
  });

  it('TC-CS-13 anything older than last month is late on sight', () => {
    freezeToday(2026, 3, 1);
    const l = line({ id: 'line-1', startDate: '2026-01-15', plan: P });
    const s = paymentService.buildCustomerStatus([l], [], [], 'customer_start_day');
    expect(s.overdue).toBe(true);
  });
});

describe('getCustomerStatuses', () => {
  beforeEach(() => freezeToday(2026, 3, 15));
  afterEach(unfreeze);

  it('TC-CS-20 inactive and occasional customers get NO status (rule 3)', () => {
    const regular = customer({ id: 'c1', customerPlans: [L1] });
    const inactive = customer({ id: 'c2', active: false, customerPlans: [L1] });
    const occasional = customer({ id: 'c3', isRegular: false, customerPlans: [L1] });
    const map = paymentService.getCustomerStatuses([regular, inactive, occasional], [], []);
    expect(map.has('c1')).toBe(true);
    expect(map.has('c2')).toBe(false);
    expect(map.has('c3')).toBe(false);
    // Absence must render no pill at all, never a red one.
    expect(customerFlags(map.get('c2') ?? null)).toEqual([]);
  });

  it('TC-CS-21 bills are sliced per customer, not shared', () => {
    const a = customer({ id: 'cust-1', customerPlans: [L1] });
    const b = customer({
      id: 'cust-2',
      customerPlans: [line({ id: 'line-b', startDate: '2026-01-01', plan: P })],
    });
    const bills = [
      ...forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01']),
    ].map((x) => ({ ...x, charge: { ...x.charge, customerId: 'cust-1' } }));
    const map = paymentService.getCustomerStatuses([a, b], bills, []);
    expect(map.get('cust-1')!.status).toBe('paid');
    expect(map.get('cust-2')!.status).toBe('unpaid');
  });
});

describe('getOverdueMonthCounts', () => {
  beforeEach(() => freezeToday(2026, 3, 15));
  afterEach(unfreeze);

  it('TC-CS-30 counts DISTINCT months, not one per line', () => {
    const c = customer({ id: 'cust-1', customerPlans: [L1, L2] });
    const counts = paymentService.getOverdueMonthCounts([c], [], []);
    // Jan + Feb + Mar on two lines is still three months behind.
    expect(counts.get('cust-1')).toBe(3);
  });

  it('TC-CS-31 a customer owing nothing is absent from the map', () => {
    const c = customer({ id: 'cust-1', customerPlans: [L1] });
    const bills = forLine('line-1', ['2026-01-01', '2026-02-01', '2026-03-01'])
      .map((x) => ({ ...x, charge: { ...x.charge, customerId: 'cust-1' } }));
    expect(paymentService.getOverdueMonthCounts([c], bills, []).has('cust-1')).toBe(false);
  });
});

describe('customerFlags / hasDebtFlag', () => {
  it('TC-CS-40 the plain "Unpaid" pill is hidden under "Overdue"', () => {
    expect(customerFlags({
      status: 'unpaid', overdue: true, planCount: { paid: 0, total: 1 },
      notDueLineIds: [], uncoveredLineIds: [],
    })).toEqual(['overdue']);
  });

  it('TC-CS-41 unpaid WITHOUT overdue keeps its own pill', () => {
    expect(customerFlags({
      status: 'unpaid', overdue: false, planCount: { paid: 0, total: 1 },
      notDueLineIds: [], uncoveredLineIds: [],
    })).toEqual(['unpaid']);
  });

  it('TC-CS-42 debt is its own fact, and only a positive one counts', () => {
    expect(hasDebtFlag(undefined)).toBe(false);
    expect(hasDebtFlag(0)).toBe(false);
    expect(hasDebtFlag(0.01)).toBe(true);
  });
});
