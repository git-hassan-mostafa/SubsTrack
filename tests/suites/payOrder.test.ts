import {
  blockingPaidMonths,
  blockingUnpaidMonths,
  coveredBillingMonths,
  latestTargetYear,
} from '@/src/modules/customer/customer-payments/utils/payOrder';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import { bill, line, plan, skip } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-PO-* — "oldest first" and its mirror "newest first". These two rules are
// the only thing stopping a paid March from sitting on top of an unpaid January.

describe('coveredBillingMonths', () => {
  it('TC-PO-01 one month covers itself', () => {
    expect(coveredBillingMonths('2026-03-01', 1)).toEqual(['2026-03-01']);
  });

  it('TC-PO-02 a bundle covers consecutive months across a year end', () => {
    expect(coveredBillingMonths('2026-11-01', 3)).toEqual([
      '2026-11-01', '2026-12-01', '2027-01-01',
    ]);
  });

  it('TC-PO-03 a zero/!negative duration still covers one month', () => {
    expect(coveredBillingMonths('2026-03-01', 0)).toEqual(['2026-03-01']);
  });
});

describe('blockingUnpaidMonths (pay oldest first)', () => {
  it('TC-PO-10 an earlier uncovered month blocks a later one', () => {
    expect(blockingUnpaidMonths(['2026-01-01', '2026-02-01'], ['2026-02-01']))
      .toEqual(['2026-01-01']);
  });

  it('TC-PO-11 months inside the same write never block it', () => {
    expect(blockingUnpaidMonths(['2026-01-01', '2026-02-01', '2026-03-01'],
      ['2026-01-01', '2026-02-01', '2026-03-01'])).toEqual([]);
  });

  it('TC-PO-12 a LATER uncovered month never blocks', () => {
    expect(blockingUnpaidMonths(['2026-05-01'], ['2026-02-01'])).toEqual([]);
  });

  it('TC-PO-13 nothing owed, or nothing targeted -> nothing blocks', () => {
    expect(blockingUnpaidMonths([], ['2026-02-01'])).toEqual([]);
    expect(blockingUnpaidMonths(['2026-01-01'], [])).toEqual([]);
  });

  it('TC-PO-14 the blocker is judged against the NEWEST target month', () => {
    // Paying Jan + Mar together: Feb sits between them and still blocks.
    expect(blockingUnpaidMonths(
      ['2026-01-01', '2026-02-01', '2026-03-01'],
      ['2026-01-01', '2026-03-01'],
    )).toEqual(['2026-02-01']);
  });
});

describe('blockingPaidMonths (void newest first)', () => {
  it('TC-PO-20 a later paid month blocks the void', () => {
    expect(blockingPaidMonths(['2026-07-01', '2026-08-01'], ['2026-07-01']))
      .toEqual(['2026-08-01']);
  });

  it('TC-PO-21 newest first — the user must undo that one next', () => {
    expect(blockingPaidMonths(
      ['2026-07-01', '2026-08-01', '2026-09-01'],
      ['2026-07-01'],
    )).toEqual(['2026-09-01', '2026-08-01']);
  });

  it('TC-PO-22 months inside the same write never block it (a whole block goes)', () => {
    expect(blockingPaidMonths(
      ['2026-07-01', '2026-08-01', '2026-09-01'],
      ['2026-07-01', '2026-08-01', '2026-09-01'],
    )).toEqual([]);
  });

  it('TC-PO-23 an EARLIER paid month never blocks', () => {
    expect(blockingPaidMonths(['2026-01-01'], ['2026-07-01'])).toEqual([]);
  });
});

describe('latestTargetYear', () => {
  it('TC-PO-30 the newest year a write touches', () => {
    expect(latestTargetYear(['2026-11-01', '2027-02-01'])).toBe(2027);
    expect(latestTargetYear([])).toBeUndefined();
  });
});

describe('PaymentService month lists', () => {
  const L = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ id: 'p1' }) });
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  it('TC-PO-40 unpaidBillingMonths is OVERDUE only — no future gaps', () => {
    const months = paymentService.unpaidBillingMonths(L, [bill('2026-02-01', 20)], []);
    expect(months).toEqual(['2026-01-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
  });

  it('TC-PO-41 uncoveredBillingMonths ALSO counts not-yet-due gaps (#81b)', () => {
    // Aug is prepaid; Jul is a hole even though it is not overdue yet.
    const bills = [bill('2026-08-01', 20)];
    const months = paymentService.uncoveredBillingMonths(L, bills, []);
    expect(months).toContain('2026-07-01');
    expect(months).not.toContain('2026-08-01');
    // ...and the walk ran past today, up to the last covered month.
    expect(months[months.length - 1]).toBe('2026-12-01');
  });

  it('TC-PO-42 a skipped month is not a hole', () => {
    const months = paymentService.uncoveredBillingMonths(L, [], [skip('2026-03-01')]);
    expect(months).not.toContain('2026-03-01');
  });

  it('TC-PO-43 before_start months are not holes', () => {
    const later = line({ id: 'line-1', startDate: '2026-04-01' });
    const months = paymentService.uncoveredBillingMonths(later, [], []);
    expect(months[0]).toBe('2026-04-01');
  });

  it('TC-PO-44 a backlog in a PREVIOUS year still blocks (#81)', () => {
    const l = line({ id: 'line-1', startDate: '2025-11-01' });
    const months = paymentService.uncoveredBillingMonths(l, [], []);
    expect(months.slice(0, 2)).toEqual(['2025-11-01', '2025-12-01']);
  });

  it('TC-PO-45 throughYear widens the walk into a year never paid before (#122)', () => {
    const withoutHint = paymentService.uncoveredBillingMonths(L, [], [], 'month_start');
    const withHint = paymentService.uncoveredBillingMonths(L, [], [], 'month_start', 2027);
    expect(withoutHint).not.toContain('2027-01-01');
    expect(withHint).toContain('2027-12-01');
  });

  it('TC-PO-46 paidBillingMonths counts a bundle month by month, sorted', () => {
    const bills = [bill('2026-02-01', 60, { durationMonths: 3, amount: 60 })];
    expect(paymentService.paidBillingMonths(bills))
      .toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('TC-PO-47 an EMPTY bill covers nothing, a voided one covers nothing', () => {
    expect(paymentService.paidBillingMonths([bill('2026-02-01', 0)])).toEqual([]);
    expect(paymentService.paidBillingMonths([
      bill('2026-02-01', 20, { voidedAt: '2026-03-01T00:00:00.000Z' }),
    ])).toEqual([]);
  });
});

describe('PaymentService order guards', () => {
  const L = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ id: 'p1' }) });
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  it('TC-PO-50 assertPayableInOrder throws naming the OLDEST blocker', () => {
    expect(() => paymentService.assertPayableInOrder(L, ['2026-05-01'], [], []))
      .toThrow(/errors\.earlier_month_unpaid/);
  });

  it('TC-PO-51 paying the whole backlog together is allowed', () => {
    const all = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];
    expect(() => paymentService.assertPayableInOrder(L, all, [], [])).not.toThrow();
  });

  it('TC-PO-52 prepaying OUT OF ORDER is refused even when nothing is overdue', () => {
    // Jan..Jun paid; Dec is a prepay that would jump Jul..Nov.
    const bills = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']
      .map((m) => bill(m, 20));
    expect(() => paymentService.assertPayableInOrder(L, ['2026-12-01'], bills, []))
      .toThrow(/errors\.earlier_month_unpaid/);
    expect(() => paymentService.assertPayableInOrder(L, ['2026-07-01'], bills, []))
      .not.toThrow();
  });

  it('TC-PO-53 voidOrderBlocker names the NEWEST paid month in the way', () => {
    const bills = [bill('2026-03-01', 20), bill('2026-04-01', 20), bill('2026-05-01', 20)];
    expect(paymentService.voidOrderBlocker(['2026-03-01'], bills)).toBe('2026-05-01');
    expect(paymentService.voidOrderBlocker(['2026-05-01'], bills)).toBeNull();
  });

  it('TC-PO-54 billVoidOrderBlocker judges a BUNDLE by every month it covers', () => {
    const bundle = bill('2026-02-01', 60, { durationMonths: 3, amount: 60 });
    const later = bill('2026-05-01', 20);
    // The bundle covers Feb-Apr; May is newer, so it blocks.
    expect(paymentService.billVoidOrderBlocker(bundle, [bundle, later])).toBe('2026-05-01');
    // With nothing after it, the whole block goes at once.
    expect(paymentService.billVoidOrderBlocker(bundle, [bundle])).toBeNull();
  });

  it('TC-PO-55 an unskip follows the VOID rule, not the pay rule (#84)', () => {
    const bills = [bill('2026-05-01', 20)];
    expect(() => paymentService.assertUnskippableInOrder(['2026-03-01'], bills))
      .toThrow(/errors\.later_month_paid_unskip/);
    expect(() => paymentService.assertUnskippableInOrder(['2026-06-01'], bills))
      .not.toThrow();
  });
});
