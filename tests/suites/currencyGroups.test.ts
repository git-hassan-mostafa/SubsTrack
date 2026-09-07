jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import {
  fundedPlans,
  groupKey,
  groupOwedByCurrency,
  planCollection,
  totalCollectingUsd,
} from '@/src/modules/ledger/utils/currencyGroups';
import { collectionService } from '@/src/modules/ledger/services/CollectionService';
import type { CollectInput } from '@/src/modules/ledger/services/CollectionService';
import type { AllocationLine, Currency, OpenItem } from '@/src/core/types';
import { store } from '../helpers/fakeLedger';
import { LBP, openItem } from '../helpers/factories';

// TC-XC-* â€” collecting from a customer who owes in MORE THAN ONE currency.
// The rule under test: a hand-over is single-currency (#108), so a mixed
// customer becomes one collection PER currency and no typed amount is ever
// converted into another currency.

beforeEach(() => store.reset());

const currencies: Currency[] = [LBP];

const usdBill = () =>
  openItem({ chargeId: 'chg-usd', amount: 50, currencyId: null, ratePerUsdSnapshot: 1 });

const lbpBill = () =>
  openItem({
    chargeId: 'chg-lbp',
    amount: 2_000_000,
    currencyId: LBP.id,
    ratePerUsdSnapshot: LBP.ratePerUsd,
    dueDate: '2026-02-01',
  });

const amountsFor = (pairs: [string, number | null][]) => new Map(pairs);

describe('groupOwedByCurrency', () => {
  it('TC-XC-01 splits the pool into one group per currency', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.currencyId).sort()).toEqual([LBP.id, null].sort());
  });

  it('TC-XC-02 orders groups by USD value, biggest debt first', () => {
    const groups = groupOwedByCurrency([lbpBill(), usdBill()], currencies);
    expect(groups[0].currencyId).toBeNull();
    expect(groups[0].owedUsd).toBeCloseTo(50, 8);
    expect(groups[1].owedUsd).toBeCloseTo(2_000_000 / 90_000, 8);
  });

  it('TC-XC-03 totals each group in its OWN units, never converted', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const lbp = groups.find((g) => g.currencyId === LBP.id)!;
    expect(lbp.owed).toBe(2_000_000);
    expect(lbp.ratePerUsd).toBe(90_000);
  });

  it('TC-XC-04 takes the rate from the LIVE currency, not an item snapshot', () => {
    const stale = openItem({
      chargeId: 'chg-old',
      amount: 900_000,
      currencyId: LBP.id,
      ratePerUsdSnapshot: 45_000,
    });
    const groups = groupOwedByCurrency([stale], currencies);
    expect(groups[0].ratePerUsd).toBe(90_000);
  });

  it('TC-XC-05 an empty pool has no groups', () => {
    expect(groupOwedByCurrency([], currencies)).toEqual([]);
  });
});

describe('planCollection', () => {
  it('TC-XC-06 splits each currency oldest-first, inside its own group', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const plans = planCollection(
      groups,
      amountsFor([
        ['__usd__', 50],
        [LBP.id, 2_000_000],
      ]),
      new Set(),
    );
    for (const plan of plans) {
      expect(plan.lines).toHaveLength(1);
      expect(plan.lines[0].item.currencyId).toBe(plan.currencyId);
      expect(plan.lines[0].settles).toBe(true);
      expect(plan.leftover).toBe(0);
    }
  });

  it('TC-XC-07 money never crosses a currency boundary', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const plans = planCollection(groups, amountsFor([['__usd__', 50]]), new Set());
    const lbp = plans.find((p) => p.currencyId === LBP.id)!;
    expect(lbp.lines).toEqual([]);
    expect(lbp.amount).toBeNull();
  });

  it('TC-XC-08 an over-typed amount leaves a leftover in that group only', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const plans = planCollection(
      groups,
      amountsFor([
        ['__usd__', 80],
        [LBP.id, 2_000_000],
      ]),
      new Set(),
    );
    const usd = plans.find((p) => p.currencyId === null)!;
    const lbp = plans.find((p) => p.currencyId === LBP.id)!;
    expect(usd.leftover).toBeCloseTo(30, 8);
    expect(lbp.leftover).toBe(0);
  });

  it('TC-XC-09 an unticked bill drops out of its own group', () => {
    const older = openItem({ chargeId: 'chg-a', amount: 20, dueDate: '2026-01-01' });
    const newer = openItem({ chargeId: 'chg-b', amount: 20, dueDate: '2026-03-01' });
    const groups = groupOwedByCurrency([older, newer], currencies);
    const plans = planCollection(
      groups,
      amountsFor([['__usd__', 20]]),
      new Set(['chg-a']),
    );
    expect(plans[0].lines).toHaveLength(1);
    expect(plans[0].lines[0].item.chargeId).toBe('chg-b');
  });

  it('TC-XC-10 the LBP amount is typed in lira and stays exact', () => {
    const groups = groupOwedByCurrency([lbpBill()], currencies);
    const plans = planCollection(groups, amountsFor([[LBP.id, 2_000_000]]), new Set());
    expect(plans[0].lines[0].amount).toBe(2_000_000);
    expect(plans[0].lines[0].settles).toBe(true);
  });
});

describe('totals and funding', () => {
  it('TC-XC-11 the cross-currency total converts at each group rate', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const plans = planCollection(
      groups,
      amountsFor([
        ['__usd__', 50],
        [LBP.id, 2_000_000],
      ]),
      new Set(),
    );
    expect(totalCollectingUsd(plans)).toBeCloseTo(50 + 2_000_000 / 90_000, 8);
  });

  it('TC-XC-12 only groups with money become a hand-over', () => {
    const groups = groupOwedByCurrency([usdBill(), lbpBill()], currencies);
    const plans = planCollection(groups, amountsFor([[LBP.id, 1_000_000]]), new Set());
    const funded = fundedPlans(plans);
    expect(funded).toHaveLength(1);
    expect(funded[0].currencyId).toBe(LBP.id);
  });

  it('TC-XC-13 groupKey gives USD a stand-in so it can be mapped', () => {
    expect(groupKey({ currencyId: null })).toBe('__usd__');
    expect(groupKey({ currencyId: LBP.id })).toBe(LBP.id);
  });
});

describe('collectMulti', () => {
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
      amount: 50,
      currencyId: null,
      ratePerUsdSnapshot: 1,
      receivedAt: '2026-02-01T10:00:00.000Z',
      receivedByUserId: 'user-1',
      notes: null,
      lines: [],
      ...over,
    };
  }

  it('TC-XC-14 writes one hand-over per currency, each in its own units', async () => {
    const usd = store.seedCharge({ id: 'chg-usd', amount: 50, currency_id: null });
    const lbp = store.seedCharge({
      id: 'chg-lbp',
      amount: 2_000_000,
      currency_id: LBP.id,
      rate_per_usd_snapshot: 90_000,
    });
    const usdItem = openItem({ chargeId: usd.id, amount: 50, currencyId: null });
    const lbpItem = openItem({
      chargeId: lbp.id,
      amount: 2_000_000,
      currencyId: LBP.id,
      ratePerUsdSnapshot: 90_000,
    });

    const { collections, failed } = await collectionService.collectMulti([
      input({ amount: 50, currencyId: null, lines: [lineOf(usdItem, 50)] }),
      input({
        amount: 2_000_000,
        currencyId: LBP.id,
        ratePerUsdSnapshot: 90_000,
        lines: [lineOf(lbpItem, 2_000_000)],
      }),
    ]);

    expect(failed).toBeNull();
    expect(collections).toHaveLength(2);
    expect(collections.map((c) => c.amount)).toEqual([50, 2_000_000]);
    expect(collections.map((c) => c.currencyId)).toEqual([null, LBP.id]);
  });

  it('TC-XC-15 both bills close at exactly zero â€” no conversion dust', async () => {
    const usd = store.seedCharge({ id: 'chg-usd', amount: 50, currency_id: null });
    const lbp = store.seedCharge({
      id: 'chg-lbp',
      amount: 2_000_000,
      currency_id: LBP.id,
      rate_per_usd_snapshot: 90_000,
    });
    await collectionService.collectMulti([
      input({
        amount: 50,
        lines: [lineOf(openItem({ chargeId: usd.id, amount: 50 }), 50)],
      }),
      input({
        amount: 2_000_000,
        currencyId: LBP.id,
        ratePerUsdSnapshot: 90_000,
        lines: [
          lineOf(
            openItem({
              chargeId: lbp.id,
              amount: 2_000_000,
              currencyId: LBP.id,
              ratePerUsdSnapshot: 90_000,
            }),
            2_000_000,
          ),
        ],
      }),
    ]);

    const paid = (chargeId: string) =>
      store.items
        .filter((i) => i.charge_id === chargeId)
        .reduce((sum, i) => sum + i.amount, 0);
    expect(paid('chg-usd')).toBe(50);
    expect(paid('chg-lbp')).toBe(2_000_000);
  });

  it('TC-XC-16 keeps the hand-over that succeeded when a later one fails', async () => {
    const usd = store.seedCharge({ id: 'chg-usd', amount: 50, currency_id: null });
    const good = input({
      amount: 50,
      lines: [lineOf(openItem({ chargeId: usd.id, amount: 50 }), 50)],
    });
    const bad = input({ amount: 10, lines: [] });

    const { collections, failed } = await collectionService.collectMulti([good, bad]);

    expect(collections).toHaveLength(1);
    expect(collections[0].amount).toBe(50);
    expect(failed?.message).toMatch(/collect_no_lines/);
    expect(store.collections).toHaveLength(1);
  });

  it('TC-XC-17 refuses an empty batch', async () => {
    await expect(collectionService.collectMulti([])).rejects.toThrow(
      /errors\.collect_no_lines/,
    );
  });

  it('TC-XC-18 still refuses a hand-over whose currency mismatches its bill', async () => {
    const lbp = store.seedCharge({
      id: 'chg-lbp',
      amount: 2_000_000,
      currency_id: LBP.id,
      rate_per_usd_snapshot: 90_000,
    });
    const lbpItem = openItem({
      chargeId: lbp.id,
      amount: 2_000_000,
      currencyId: LBP.id,
      ratePerUsdSnapshot: 90_000,
    });
    const { collections, failed } = await collectionService.collectMulti([
      input({ amount: 2_000_000, currencyId: null, lines: [lineOf(lbpItem, 2_000_000)] }),
    ]);
    expect(collections).toEqual([]);
    expect(failed?.message).toMatch(/collect_currency_mismatch/);
  });
});
