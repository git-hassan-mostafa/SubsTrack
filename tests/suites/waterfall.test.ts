
import {
  allocate,
  allocateExcluding,
  compareOpenItems,
  keyOf,
  sortByDue,
  totalOwed,
} from '@/src/modules/ledger/utils/waterfall';
import { openItem } from '../helpers/factories';

// TC-WF-* — the oldest-first split. Everything the collect sheet previews and
// the write then saves comes out of here, so this is the most load-bearing pure
// function in the app.

describe('waterfall: ordering', () => {
  it('TC-WF-01 sorts by due date first', () => {
    const feb = openItem({ chargeId: 'b', dueDate: '2026-02-01' });
    const jan = openItem({ chargeId: 'a', dueDate: '2026-01-01' });
    expect(sortByDue([feb, jan]).map((i) => i.chargeId)).toEqual(['a', 'b']);
  });

  it('TC-WF-02 a back-dated custom debt does NOT jump the queue on issue date', () => {
    // Typed today, owed since 2020 -> it IS the oldest. dueDate is the rule.
    const old = openItem({
      chargeId: 'old',
      kind: 'manual',
      dueDate: '2020-01-01',
      issuedAt: '2026-06-01T00:00:00.000Z',
    });
    const jan = openItem({ chargeId: 'jan', dueDate: '2026-01-01' });
    expect(sortByDue([jan, old]).map((i) => i.chargeId)).toEqual(['old', 'jan']);
  });

  it('TC-WF-03 same due date -> issuedAt breaks the tie', () => {
    const late = openItem({ chargeId: 'late', issuedAt: '2026-03-01T00:00:00.000Z' });
    const early = openItem({ chargeId: 'early', issuedAt: '2026-02-01T00:00:00.000Z' });
    expect(sortByDue([late, early]).map((i) => i.chargeId)).toEqual(['early', 'late']);
  });

  it('TC-WF-04 total order: two identical rows still sort deterministically', () => {
    const a = openItem({ chargeId: 'aaa' });
    const b = openItem({ chargeId: 'bbb' });
    expect(compareOpenItems(a, b)).toBeLessThan(0);
    expect(compareOpenItems(b, a)).toBeGreaterThan(0);
    expect(compareOpenItems(a, a)).toBe(0);
  });

  it('TC-WF-05 a virtual month keys off its natural key, a stored bill off its id', () => {
    expect(keyOf(openItem({ chargeId: 'chg-9' }))).toBe('chg-9');
    expect(
      keyOf(openItem({ chargeId: null, customerPlanId: 'l1', billingMonth: '2026-05-01' })),
    ).toBe('l1:2026-05-01');
  });

  it('TC-WF-06 sortByDue does not mutate its input', () => {
    const items = [openItem({ dueDate: '2026-02-01' }), openItem({ dueDate: '2026-01-01' })];
    const before = items.map((i) => i.dueDate);
    sortByDue(items);
    expect(items.map((i) => i.dueDate)).toEqual(before);
  });
});

describe('waterfall: allocation', () => {
  const jan = openItem({ chargeId: 'jan', dueDate: '2026-01-01', amount: 20 });
  const feb = openItem({ chargeId: 'feb', dueDate: '2026-02-01', amount: 20 });
  const sale = openItem({
    chargeId: 'sale',
    kind: 'sale',
    dueDate: '2026-02-10',
    amount: 15,
    isDebt: true,
  });

  it('TC-WF-10 fills each bill completely, oldest first', () => {
    const { lines, leftover } = allocate(55, [sale, feb, jan]);
    expect(lines.map((l) => [l.item.chargeId, l.amount])).toEqual([
      ['jan', 20],
      ['feb', 20],
      ['sale', 15],
    ]);
    expect(leftover).toBe(0);
  });

  it('TC-WF-11 never splits proportionally - a short amount stops mid-queue', () => {
    const { lines, leftover } = allocate(30, [jan, feb, sale]);
    expect(lines.map((l) => [l.item.chargeId, l.amount, l.settles])).toEqual([
      ['jan', 20, true],
      ['feb', 10, false],
    ]);
    expect(leftover).toBe(0);
  });

  it('TC-WF-12 leftover is what the caller must refuse', () => {
    const { leftover } = allocate(100, [jan, feb, sale]);
    expect(leftover).toBe(45);
  });

  it('TC-WF-13 skips a bill with no balance left', () => {
    const settled = openItem({ chargeId: 'settled', amount: 20, paid: 20 });
    const { lines } = allocate(20, [settled, feb]);
    expect(lines.map((l) => l.item.chargeId)).toEqual(['feb']);
  });

  it('TC-WF-14 unticking a row moves the money down to the next bill', () => {
    const { lines } = allocateExcluding(20, [jan, feb, sale], new Set(['jan']));
    expect(lines.map((l) => [l.item.chargeId, l.amount])).toEqual([['feb', 20]]);
  });

  it('TC-WF-15 zero and negative amounts allocate nothing', () => {
    expect(allocate(0, [jan]).lines).toEqual([]);
    expect(allocate(-5, [jan]).lines).toEqual([]);
  });

  it('TC-WF-16 float dust never leaves a bill a millionth short', () => {
    const a = openItem({ chargeId: 'a', amount: 0.1, dueDate: '2026-01-01' });
    const b = openItem({ chargeId: 'b', amount: 0.2, dueDate: '2026-02-01' });
    const { lines, leftover } = allocate(0.3, [a, b]);
    expect(leftover).toBe(0);
    expect(lines[1].settles).toBe(true);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(0.3, 10);
  });

  it('TC-WF-17 the split always sums to exactly what was allocated', () => {
    const items = [jan, feb, sale];
    for (const amount of [1, 19.99, 20, 20.01, 35, 54.99, 55]) {
      const { lines, leftover } = allocate(amount, items);
      const sum = lines.reduce((s, l) => s + l.amount, 0);
      expect(sum + leftover).toBeCloseTo(amount, 8);
    }
  });

  it('TC-WF-18 totalOwed is the overpay ceiling and ignores negative balances', () => {
    const over = openItem({ chargeId: 'over', amount: 10, paid: 15 }); // balance -5
    expect(totalOwed([jan, feb, sale])).toBe(55);
    expect(totalOwed([jan, over])).toBe(20);
  });

  it('TC-WF-19 the preview and the save agree on order regardless of input order', () => {
    const shuffled = [sale, jan, feb];
    const a = allocate(55, shuffled).lines.map((l) => l.item.chargeId);
    const b = allocate(55, [...shuffled].reverse()).lines.map((l) => l.item.chargeId);
    expect(a).toEqual(b);
  });
});
