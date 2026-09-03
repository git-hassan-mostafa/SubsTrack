import {
  convert,
  formatMoneyPair,
  formatPaidFraction,
  fromUsd,
  groupByCurrency,
  snapshotCurrency,
  sumUsd,
  toUsd,
} from '@/src/core/utils/currency';
import {
  dayToInstantIso,
  daysLate,
  getTodayDateString,
  localMonthKey,
  toBillingMonth,
} from '@/src/core/utils/date';
import { sumByMonth } from '@/src/modules/ledger/utils/monthTotals';
import { LBP } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-CU-* / TC-DT-* — the two conversions every money figure passes through:
// units -> USD via a FROZEN rate, and an instant -> the month it belongs to.

describe('currency', () => {
  it('TC-CU-01 null means USD, with no conversion at all', () => {
    expect(toUsd(25, null)).toBe(25);
    expect(fromUsd(25, null)).toBe(25);
    expect(convert(25, null, null)).toBe(25);
  });

  it('TC-CU-02 conversion goes via USD', () => {
    expect(toUsd(180000, LBP)).toBe(2);
    expect(fromUsd(2, LBP)).toBe(180000);
    expect(convert(180000, LBP, null)).toBe(2);
    expect(convert(2, null, LBP)).toBe(180000);
  });

  it('TC-CU-03 same currency in and out is a no-op, not a round trip', () => {
    expect(convert(180000, LBP, { ...LBP })).toBe(180000);
  });

  it('TC-CU-04 sumUsd uses each row`s FROZEN rate, never one shared rate', () => {
    // Same 180000 LBP, collected at two different rates.
    expect(sumUsd([
      { amount: 180000, ratePerUsdSnapshot: 90000 },
      { amount: 180000, ratePerUsdSnapshot: 60000 },
    ])).toBe(5);
  });

  it('TC-CU-05 snapshotCurrency pins the row`s rate onto today`s currency', () => {
    const pinned = snapshotCurrency({ currencyId: LBP.id, ratePerUsdSnapshot: 60000 }, [LBP]);
    expect(pinned!.ratePerUsd).toBe(60000);
    expect(pinned!.code).toBe('LBP');
    expect(snapshotCurrency({ currencyId: null, ratePerUsdSnapshot: 1 }, [LBP])).toBeNull();
  });

  it('TC-CU-06 groupByCurrency folds per PHYSICAL currency, largest USD first', () => {
    const rows = [
      { amount: 10, ratePerUsdSnapshot: 1, currencyId: null },
      { amount: 180000, ratePerUsdSnapshot: 90000, currencyId: LBP.id },
      { amount: 90000, ratePerUsdSnapshot: 90000, currencyId: LBP.id },
    ];
    expect(groupByCurrency(rows)).toEqual([
      { currencyId: null, amount: 10, usd: 10 },
      { currencyId: LBP.id, amount: 270000, usd: 3 },
    ]);
  });

  it('TC-CU-07 formatPaidFraction prints the label once', () => {
    expect(formatPaidFraction(20, 50, null, null)).toBe('20.00/$50.00');
  });

  it('TC-CU-08 formatMoneyPair leads with the currency COLLECTED, converting only the hint', () => {
    expect(formatMoneyPair(180000, LBP, null)).toEqual({
      primary: '180,000 L.L.',
      approx: '≈ $2.00',
    });
  });

  it('TC-CU-09 formatMoneyPair drops the hint when it would repeat the amount', () => {
    expect(formatMoneyPair(20, null, null).approx).toBeNull();
    expect(formatMoneyPair(180000, LBP, LBP).approx).toBeNull();
  });
});

describe('dates', () => {
  afterEach(unfreeze);

  it('TC-DT-01 toBillingMonth always pads to YYYY-MM-01', () => {
    expect(toBillingMonth(2026, 3)).toBe('2026-03-01');
    expect(toBillingMonth(2026, 12)).toBe('2026-12-01');
  });

  it('TC-DT-02 a picked day + time is taken as a local instant', () => {
    const iso = dayToInstantIso('2026-04-05 14:30');
    expect(new Date(iso).getHours()).toBe(14);
    expect(new Date(iso).getMinutes()).toBe(30);
  });

  it('TC-DT-03 a bare PAST day lands at local noon (safe in every timezone)', () => {
    freezeToday(2026, 6, 15);
    const iso = dayToInstantIso('2026-04-05');
    expect(new Date(iso).getHours()).toBe(12);
    expect(new Date(iso).getDate()).toBe(5);
  });

  it('TC-DT-04 a bare TODAY keeps the current clock', () => {
    freezeToday(2026, 6, 15);
    const iso = dayToInstantIso(getTodayDateString());
    expect(iso).toBe(new Date().toISOString());
  });

  it('TC-DT-05 localMonthKey buckets by the LOCAL month, not UTC', () => {
    const local = new Date(2026, 0, 1, 0, 30, 0); // 1 Jan 00:30 local
    expect(localMonthKey(local.toISOString())).toBe('2026-01');
    // A bare calendar day is already local — cut as-is.
    expect(localMonthKey('2026-01-01')).toBe('2026-01');
  });

  it('TC-DT-06 daysLate floors at 0 and the due day itself is not late', () => {
    const today = new Date(2026, 2, 15, 12, 0, 0);
    expect(daysLate('2026-03-15', today)).toBe(0);
    expect(daysLate('2026-03-20', today)).toBe(0);
    expect(daysLate('2026-03-14', today)).toBe(1);
    expect(daysLate('2026-01-15', today)).toBe(59);
  });
});

describe('sumByMonth (the money-in section headers)', () => {
  it('TC-DT-10 sums in USD per LOCAL month via each row`s frozen rate', () => {
    const jan = new Date(2026, 0, 10, 9, 0, 0).toISOString();
    const feb = new Date(2026, 1, 10, 9, 0, 0).toISOString();
    expect(sumByMonth([
      { received_at: jan, amount: 20, rate_per_usd_snapshot: 1 },
      { received_at: jan, amount: 180000, rate_per_usd_snapshot: 90000 },
      { received_at: feb, amount: 5, rate_per_usd_snapshot: 1 },
    ])).toEqual({ '2026-01': 22, '2026-02': 5 });
  });

  it('TC-DT-11 a zero or missing rate never divides by zero', () => {
    expect(sumByMonth([
      { received_at: '2026-01-10T09:00:00.000Z', amount: 20, rate_per_usd_snapshot: 0 },
    ])['2026-01']).toBe(20);
  });
});
