jest.mock('@/src/modules/ledger/repository/ChargeRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeChargeRepository,
}));
jest.mock('@/src/modules/ledger/repository/CollectionRepository', () => ({
  __esModule: true,
  default: require('../helpers/fakeLedger').fakeCollectionRepository,
}));

import { chargeService } from '@/src/modules/ledger/services/ChargeService';
import { fakeChargeRepository, store } from '../helpers/fakeLedger';

// TC-CH-* — raising, correcting, voiding and writing off a BILL. Money is never
// touched here; the split is CollectionService's job.

beforeEach(() => store.reset());

const balanceOf = async (id: string) => (await fakeChargeRepository.balances([id]))[0];

describe('addManualCharge', () => {
  const base = {
    tenantId: 't1',
    customerId: 'cust-1',
    branchId: null,
    description: 'Installation',
    amount: 25,
    currencyId: null,
    ratePerUsdSnapshot: 1,
    dueDate: '2026-02-01',
    recordedByUserId: 'user-1',
  };

  it('TC-CH-01 refuses a non-positive or non-finite amount', async () => {
    for (const amount of [0, -1, NaN]) {
      await expect(chargeService.addManualCharge({ ...base, amount }))
        .rejects.toThrow(/errors\.debt_amount_positive/);
    }
  });

  it('TC-CH-02 refuses a missing customer or description', async () => {
    await expect(chargeService.addManualCharge({ ...base, customerId: '' }))
      .rejects.toThrow(/errors\.debt_customer_required/);
    await expect(chargeService.addManualCharge({ ...base, description: '   ' }))
      .rejects.toThrow(/errors\.debt_description_required/);
  });

  it('TC-CH-03 refuses a rate snapshot that is not positive', async () => {
    await expect(chargeService.addManualCharge({ ...base, ratePerUsdSnapshot: 0 }))
      .rejects.toThrow(/errors\.rate_snapshot_positive/);
  });

  it('TC-CH-04 writes a manual bill with its own due date and no month keys', async () => {
    const charge = await chargeService.addManualCharge(base);
    expect(charge.kind).toBe('manual');
    expect(charge.customerPlanId).toBeNull();
    expect(charge.billingMonth).toBeNull();
    expect(charge.dueDate).toBe('2026-02-01');
    expect(charge.description).toBe('Installation');
  });
});

describe('voidCharge (the bill was a mistake)', () => {
  it('TC-CH-10 refuses a bill money is sitting on', async () => {
    const chg = store.seedCharge({ amount: 20 });
    store.seedCollection(chg.id, 5);
    await expect(chargeService.voidCharge(chg.id, 'user-1', null))
      .rejects.toThrow(/errors\.charge_void_has_money/);
  });

  it('TC-CH-11 allows it once the hand-over was voided', async () => {
    const chg = store.seedCharge({ amount: 20 });
    const col = store.seedCollection(chg.id, 20);
    await fakeChargeRepository.void; // no-op, keeps the import honest
    (await import('@/src/modules/ledger/services/CollectionService')).collectionService;
    const { collectionService } = await import('@/src/modules/ledger/services/CollectionService');
    await collectionService.voidCollection(col.id, 'user-1', null);
    await expect(chargeService.voidCharge(chg.id, 'user-1', null)).resolves.toBeTruthy();
    expect(store.charge(chg.id)!.voided_at).not.toBeNull();
  });

  it('TC-CH-12 a WRITTEN-OFF bill with money on it is still refused', async () => {
    const chg = store.seedCharge({ amount: 20, written_off_at: '2026-02-01T00:00:00.000Z' });
    store.seedCollection(chg.id, 5);
    await expect(chargeService.voidCharge(chg.id, 'user-1', null))
      .rejects.toThrow(/errors\.charge_void_has_money/);
  });
});

describe('voidChargeWithPayments (the bill AND its cash)', () => {
  it('TC-CH-20 voids every live hand-over on the bill, then the bill', async () => {
    const chg = store.seedCharge({ amount: 60 });
    const a = store.seedCollection(chg.id, 20);
    const b = store.seedCollection(chg.id, 40);
    await chargeService.voidChargeWithPayments(chg.id, 'user-1', 'wrong month');
    expect(store.collections.find((c) => c.id === a.id)!.voided_at).not.toBeNull();
    expect(store.collections.find((c) => c.id === b.id)!.voided_at).not.toBeNull();
    expect(store.charge(chg.id)!.voided_at).not.toBeNull();
  });

  it('TC-CH-21 a SHARED hand-over is voided whole - the other bill loses its money too', async () => {
    const jan = store.seedCharge({ id: 'jan', amount: 20, billing_month: '2026-01-01' });
    const feb = store.seedCharge({ id: 'feb', amount: 20, billing_month: '2026-02-01' });
    const col = store.seedCollection(jan.id, 20, { amount: 40 });
    // The same hand-over also settled February.
    store.items.push({
      id: 'ci-feb', tenant_id: 't1', collection_id: col.id, charge_id: feb.id,
      amount: 20, created_at: col.created_at, updated_at: col.updated_at,
    });
    expect((await balanceOf('feb')).paid).toBe(20);
    await chargeService.voidChargeWithPayments('jan', 'user-1', null);
    // This is the documented collateral damage the confirm has to warn about.
    expect((await balanceOf('feb')).paid).toBe(0);
    expect(store.charge('feb')!.voided_at).toBeNull();
  });

  it('TC-CH-22 paymentIdsForCharges de-dupes one hand-over covering many bills', async () => {
    const jan = store.seedCharge({ id: 'jan', amount: 20 });
    const feb = store.seedCharge({ id: 'feb', amount: 20 });
    const col = store.seedCollection(jan.id, 20, { amount: 40 });
    store.items.push({
      id: 'ci-feb', tenant_id: 't1', collection_id: col.id, charge_id: feb.id,
      amount: 20, created_at: col.created_at, updated_at: col.updated_at,
    });
    expect(await chargeService.paymentIdsForCharges(['jan', 'feb'])).toEqual([col.id]);
  });

  it('TC-CH-23 a voided hand-over is not re-voided', async () => {
    const chg = store.seedCharge({ amount: 20 });
    const col = store.seedCollection(chg.id, 20, { voided_at: '2026-02-05T00:00:00.000Z' });
    await chargeService.voidChargeWithPayments(chg.id, 'user-2', 'again');
    expect(store.collections.find((c) => c.id === col.id)!.voided_by).toBeNull();
  });
});

describe('writeOff (real, but lost)', () => {
  it('TC-CH-30 refuses a voided bill and a second write-off', async () => {
    const voided = store.seedCharge({ amount: 20, voided_at: '2026-02-01T00:00:00.000Z' });
    await expect(chargeService.writeOff(voided.id, 'user-1', null))
      .rejects.toThrow(/errors\.charge_voided/);
    const lost = store.seedCharge({ amount: 20, written_off_at: '2026-02-01T00:00:00.000Z' });
    await expect(chargeService.writeOff(lost.id, 'user-1', null))
      .rejects.toThrow(/errors\.charge_already_written_off/);
  });

  it('TC-CH-31 a written-off bill KEEPS the money already collected (#115)', async () => {
    const chg = store.seedCharge({ amount: 20 });
    store.seedCollection(chg.id, 5);
    await chargeService.writeOff(chg.id, 'user-1', 'gone');
    expect((await balanceOf(chg.id)).paid).toBe(5);
  });

  it('TC-CH-32 only the part never collected counts as a loss', async () => {
    const chg = store.seedCharge({ amount: 20, written_off_at: '2026-02-10T00:00:00.000Z' });
    store.seedCollection(chg.id, 5);
    const lost = await chargeService.writtenOffUsdInRange(
      '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', null,
    );
    expect(lost).toBe(15);
  });

  it('TC-CH-33 a VOIDED hand-over does not reduce the loss', async () => {
    const chg = store.seedCharge({ amount: 20, written_off_at: '2026-02-10T00:00:00.000Z' });
    store.seedCollection(chg.id, 5, { voided_at: '2026-02-09T00:00:00.000Z' });
    const lost = await chargeService.writtenOffUsdInRange(
      '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', null,
    );
    expect(lost).toBe(20);
  });

  it('TC-CH-34 the loss is converted at the bill`s FROZEN rate', async () => {
    store.seedCharge({
      amount: 180000, currency_id: 'cur-lbp', rate_per_usd_snapshot: 90000,
      written_off_at: '2026-02-10T00:00:00.000Z',
    });
    const lost = await chargeService.writtenOffUsdInRange(
      '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', null,
    );
    expect(lost).toBeCloseTo(2, 10);
  });
});

describe('updateManualCharge', () => {
  it('TC-CH-40 refuses a non-positive amount', async () => {
    const chg = store.seedCharge({ kind: 'manual', amount: 20 });
    await expect(chargeService.updateManualCharge(chg.id, { amount: 0 }))
      .rejects.toThrow(/errors\.debt_amount_positive/);
  });

  it('TC-CH-41 trims the description and leaves untouched fields alone', async () => {
    const chg = store.seedCharge({ kind: 'manual', amount: 20, description: 'Old' });
    const updated = await chargeService.updateManualCharge(chg.id, { description: '  New  ' });
    expect(updated.description).toBe('New');
    expect(updated.amount).toBe(20);
  });

  it('TC-CH-42 REGRESSION: it must not price a bill below what was collected', async () => {
    const chg = store.seedCharge({ kind: 'manual', amount: 50 });
    store.seedCollection(chg.id, 50);
    await expect(chargeService.updateManualCharge(chg.id, { amount: 20 }))
      .rejects.toThrow();
  });

  it('TC-CH-43 REGRESSION: it must not edit a voided or written-off bill', async () => {
    const voided = store.seedCharge({ kind: 'manual', amount: 50, voided_at: '2026-02-01T00:00:00.000Z' });
    await expect(chargeService.updateManualCharge(voided.id, { amount: 20 })).rejects.toThrow();
  });
});
