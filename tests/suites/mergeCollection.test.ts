import { mergeCollection } from '@/src/state/slices/payments/utils/mergeCollection';
import { bill, charge, collection, collectionItem } from '../helpers/factories';

// TC-MC-* — patching the month grid from the row a write returned, instead of
// re-querying. A wrong patch shows the user a green month that is not paid (or
// a red one that is), until something else forces a reload.

describe('mergeCollection', () => {
  it('TC-MC-01 adds money to a bill already in the store', () => {
    const bills = [bill('2026-01-01', 0, { id: 'chg-jan' })];
    const col = collection({
      items: [collectionItem({ chargeId: 'chg-jan', amount: 20 })],
    });
    const merged = mergeCollection(bills, col);
    expect(merged).toHaveLength(1);
    expect(merged[0].collected).toBe(20);
  });

  it('TC-MC-02 appends a month bill this collect raised for the first time', () => {
    const col = collection({
      items: [
        collectionItem({
          chargeId: 'chg-new',
          amount: 20,
          charge: charge({ id: 'chg-new', kind: 'month', billingMonth: '2026-04-01' }),
        }),
      ],
    });
    const merged = mergeCollection([], col);
    expect(merged).toHaveLength(1);
    expect(merged[0].charge.id).toBe('chg-new');
    expect(merged[0].collected).toBe(20);
  });

  it('TC-MC-03 a SALE line is not the grid`s business', () => {
    const col = collection({
      items: [
        collectionItem({
          chargeId: 'chg-sale',
          amount: 15,
          charge: charge({ id: 'chg-sale', kind: 'sale' }),
        }),
      ],
    });
    expect(mergeCollection([], col)).toEqual([]);
  });

  it('TC-MC-04 a void takes the money back off the bill', () => {
    const bills = [bill('2026-01-01', 20, { id: 'chg-jan' })];
    const col = collection({
      items: [collectionItem({ chargeId: 'chg-jan', amount: 20 })],
    });
    const merged = mergeCollection(bills, col, -1);
    expect(merged[0].collected).toBe(0);
  });

  it('TC-MC-05 a void never drops the emptied bill and never goes negative', () => {
    const bills = [bill('2026-01-01', 5, { id: 'chg-jan' })];
    const col = collection({
      items: [collectionItem({ chargeId: 'chg-jan', amount: 20 })],
    });
    const merged = mergeCollection(bills, col, -1);
    expect(merged).toHaveLength(1);
    expect(merged[0].collected).toBe(0);
  });

  it('TC-MC-06 money on a DEAD bill is dropped rather than painted green', () => {
    const col = collection({
      items: [
        collectionItem({
          chargeId: 'chg-dead',
          amount: 20,
          charge: charge({ id: 'chg-dead', voidedAt: '2026-02-01T00:00:00.000Z' }),
        }),
      ],
    });
    expect(mergeCollection([], col)).toEqual([]);
  });

  it('TC-MC-07 two items against the SAME bill both land', () => {
    const bills = [bill('2026-01-01', 0, { id: 'chg-jan' })];
    const col = collection({
      items: [
        collectionItem({ id: 'a', chargeId: 'chg-jan', amount: 5 }),
        collectionItem({ id: 'b', chargeId: 'chg-jan', amount: 7 }),
      ],
    });
    expect(mergeCollection(bills, col)[0].collected).toBe(12);
  });

  it('TC-MC-08 REGRESSION: a RE-PRICED bill must take the new amount from the write', () => {
    // The store holds the stale $30 bill; the collect re-priced it to $25 and
    // the returned item carries the corrected row (#106b).
    const bills = [bill('2026-01-01', 0, { id: 'chg-jan', amount: 30 })];
    const col = collection({
      amount: 25,
      items: [
        collectionItem({
          chargeId: 'chg-jan',
          amount: 25,
          charge: charge({ id: 'chg-jan', kind: 'month', billingMonth: '2026-01-01', amount: 25 }),
        }),
      ],
    });
    const merged = mergeCollection(bills, col);
    expect(merged[0].collected).toBe(25);
    // Without this the grid reads "PARTIAL 25/30" on a month that is settled.
    expect(merged[0].charge.amount).toBe(25);
  });
});
