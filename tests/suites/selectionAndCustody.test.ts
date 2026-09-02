import {
  expandSelectionUnit,
  groupPayableBlocks,
} from '@/src/modules/customer/customer-payments/utils/monthSelection';
import paymentService from '@/src/modules/customer/customer-payments/services/PaymentService';
import {
  canCloseOut,
  canReceiveFrom,
  custodyTargetFor,
  receiveBlock,
  walletRank,
  type WalletActor,
} from '@/src/modules/wallet/utils/custody';
import { bill, line, plan } from '../helpers/factories';
import { freezeToday, unfreeze } from '../helpers/clock';

// TC-MS-* — which cells select together. TC-WA-* — who may take whose cash.

describe('expandSelectionUnit', () => {
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  const monthly = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ durationMonths: 1 }) });
  const quarterly = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ durationMonths: 3 }) });

  it('TC-MS-01 a single-month plan selects only the tapped cell', () => {
    const grid = paymentService.buildMonthGrid(monthly, [], [], 2026);
    expect(expandSelectionUnit(grid[2], grid, monthly)).toEqual(['2026-03-01']);
  });

  it('TC-MS-02 a paid cell selects every month sharing its bill', () => {
    const bundle = bill('2026-02-01', 60, { durationMonths: 3, amount: 60 });
    const grid = paymentService.buildMonthGrid(quarterly, [bundle], [], 2026);
    expect(expandSelectionUnit(grid[1], grid, quarterly)).toEqual([
      '2026-02-01', '2026-03-01', '2026-04-01',
    ]);
  });

  it('TC-MS-03 a multi-month payable cell selects its whole start-aligned window', () => {
    const grid = paymentService.buildMonthGrid(quarterly, [], [], 2026);
    // Start Jan -> windows are Jan-Mar, Apr-Jun, ... Tapping May selects Apr-Jun.
    expect(expandSelectionUnit(grid[4], grid, quarterly)).toEqual([
      '2026-04-01', '2026-05-01', '2026-06-01',
    ]);
  });

  it('TC-MS-04 a skipped cell selects only itself (it can only be unskipped)', () => {
    const grid = paymentService.buildMonthGrid(
      quarterly, [], [{ ...require('../helpers/factories').skip('2026-05-01') }], 2026,
    );
    expect(expandSelectionUnit(grid[4], grid, quarterly)).toEqual(['2026-05-01']);
  });

  it('TC-MS-05 a before_start cell is not selectable at all', () => {
    const later = line({ id: 'line-1', startDate: '2026-06-01', plan: plan() });
    const grid = paymentService.buildMonthGrid(later, [], [], 2026);
    expect(expandSelectionUnit(grid[0], grid, later)).toEqual([]);
  });
});

describe('groupPayableBlocks', () => {
  beforeEach(() => freezeToday(2026, 6, 15));
  afterEach(unfreeze);

  const quarterly = line({ id: 'line-1', startDate: '2026-01-01', plan: plan({ durationMonths: 3 }) });

  it('TC-MS-10 months of one window collapse to ONE bill, billed from its start', () => {
    const grid = paymentService.buildMonthGrid(quarterly, [], [], 2026);
    const picked = [grid[3], grid[4], grid[5]]; // Apr, May, Jun
    expect(groupPayableBlocks(picked, quarterly)).toEqual([{ startBillingMonth: '2026-04-01' }]);
  });

  it('TC-MS-11 two windows become two bills, oldest first', () => {
    const grid = paymentService.buildMonthGrid(quarterly, [], [], 2026);
    const picked = [grid[1], grid[4]]; // Feb (Jan-Mar) and May (Apr-Jun)
    expect(groupPayableBlocks(picked, quarterly)).toEqual([
      { startBillingMonth: '2026-01-01' },
      { startBillingMonth: '2026-04-01' },
    ]);
  });

  it('TC-MS-12 windows are anchored at the line start, never at January', () => {
    const feb = line({ id: 'line-1', startDate: '2026-02-01', plan: plan({ durationMonths: 3 }) });
    const grid = paymentService.buildMonthGrid(feb, [], [], 2026);
    // Windows are Feb-Apr, May-Jul... so April belongs to the FEBRUARY block.
    expect(groupPayableBlocks([grid[3]], feb)).toEqual([{ startBillingMonth: '2026-02-01' }]);
  });
});

describe('wallet custody', () => {
  const collector: WalletActor = { id: 'u1', role: 'user', branchId: 'b1' };
  const looseCollector: WalletActor = { id: 'u2', role: 'user', branchId: null };
  const branchAdmin: WalletActor = { id: 'a1', role: 'admin', branchId: 'b1' };
  const otherBranchAdmin: WalletActor = { id: 'a2', role: 'admin', branchId: 'b2' };
  const tenantAdmin: WalletActor = { id: 'a3', role: 'admin', branchId: null };
  const owner: WalletActor = { id: 'o1', role: 'superadmin', branchId: null };

  it('TC-WA-01 only branch_id separates a branch admin from a tenant-wide one', () => {
    expect(walletRank(collector)).toBe(0);
    expect(walletRank(branchAdmin)).toBe(1);
    expect(walletRank(tenantAdmin)).toBe(2);
    expect(walletRank(owner)).toBe(3);
  });

  it('TC-WA-02 nobody receives from themselves', () => {
    expect(receiveBlock(branchAdmin, branchAdmin)).toBe('self');
  });

  it('TC-WA-03 a peer is not "under" anyone', () => {
    expect(receiveBlock(branchAdmin, otherBranchAdmin)).toBe('rank');
    expect(receiveBlock(collector, looseCollector)).toBe('rank');
  });

  it('TC-WA-04 cash never moves DOWN the chain', () => {
    expect(receiveBlock(collector, branchAdmin)).toBe('rank');
    expect(receiveBlock(branchAdmin, tenantAdmin)).toBe('rank');
  });

  it('TC-WA-05 a branch admin reaches only their own branch', () => {
    expect(receiveBlock(branchAdmin, collector)).toBeNull();
    expect(receiveBlock(branchAdmin, { id: 'u9', role: 'user', branchId: 'b2' })).toBe('branch');
    // An unassigned collector needs rank 2 or up.
    expect(receiveBlock(branchAdmin, looseCollector)).toBe('branch');
    expect(receiveBlock(tenantAdmin, looseCollector)).toBeNull();
  });

  it('TC-WA-06 only rank 2 and up may close out their own wallet', () => {
    expect(canCloseOut(collector)).toBe(false);
    expect(canCloseOut(branchAdmin)).toBe(false);
    expect(canCloseOut(tenantAdmin)).toBe(true);
    expect(canCloseOut(owner)).toBe(true);
  });

  it('TC-WA-07 cash reaching the owner LEAVES the chain', () => {
    expect(custodyTargetFor(owner)).toBeNull();
    expect(custodyTargetFor(tenantAdmin)).toBe('a3');
    expect(canReceiveFrom(owner, tenantAdmin)).toBe(true);
  });
});
