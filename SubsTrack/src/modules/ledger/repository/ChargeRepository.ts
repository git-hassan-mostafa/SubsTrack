import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbCharge, DbChargeBalance } from '@/src/core/types/db';
import type {
  CreateChargePayload,
  FindChargesOptions,
  IChargeRepository,
  UpdateChargePayload,
} from './IChargeRepository';
import { OfflineChargeRepository } from './ChargeRepository.offline';

// A bill with everything a label needs. The customer join is LEFT — a walk-in
// sale charge has none.
const CHARGE_SELECT = '*, customers(*), customer_plans(*, plans(*)), sales(*)';
const CHARGE_SELECT_LEAN = '*, customers(*)';

export class ChargeRepository extends BaseRepository implements IChargeRepository {
  async findById(id: string): Promise<DbCharge | null> {
    const { data, error } = await this.db
      .from('charges')
      .select(CHARGE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbCharge) ?? null;
  }

  async findByIds(ids: string[]): Promise<DbCharge[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db.from('charges').select(CHARGE_SELECT).in('id', ids);
    if (error) this.handleError(error);
    return (data ?? []) as DbCharge[];
  }

  async findMonthChargesForLines(customerPlanIds: string[]): Promise<DbCharge[]> {
    if (customerPlanIds.length === 0) return [];
    const { data, error } = await this.db
      .from('charges')
      .select('*')
      .eq('kind', 'month')
      .in('customer_plan_id', customerPlanIds)
      // A voided bill is invisible to the grid, exactly as a voided payment was.
      .is('voided_at', null)
      .order('billing_month', { ascending: true });
    if (error) this.handleError(error);
    return (data ?? []) as DbCharge[];
  }

  async findMonthChargesForCustomer(customerId: string): Promise<DbCharge[]> {
    const { data, error } = await this.db
      .from('charges')
      .select('*')
      .eq('kind', 'month')
      .eq('customer_id', customerId)
      .is('voided_at', null)
      .order('billing_month', { ascending: true });
    if (error) this.handleError(error);
    return (data ?? []) as DbCharge[];
  }

  async findBySaleId(saleId: string): Promise<DbCharge | null> {
    const { data, error } = await this.db
      .from('charges')
      .select(CHARGE_SELECT_LEAN)
      .eq('sale_id', saleId)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbCharge) ?? null;
  }

  async find(opts: FindChargesOptions): Promise<DbCharge[]> {
    let query = this.db.from('charges').select(CHARGE_SELECT).is('voided_at', null);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.customerIds?.length) query = query.in('customer_id', opts.customerIds);
    if (opts.kinds?.length) query = query.in('kind', opts.kinds);
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.charges);
    const { data, error } = await query.order('due_date', { ascending: true });
    if (error) this.handleError(error);
    const rows = (data ?? []) as DbCharge[];
    if (!opts.openOnly) return rows;
    const open = new Set((await this.balances(rows.map((r) => r.id))).filter((b) => b.balance > 0).map((b) => b.id));
    return rows.filter((r) => open.has(r.id));
  }

  async balances(chargeIds: string[]): Promise<DbChargeBalance[]> {
    if (chargeIds.length === 0) return [];
    const { data, error } = await this.db
      .from('charge_balances')
      .select('*')
      .in('id', chargeIds);
    if (error) this.handleError(error);
    return (data ?? []) as DbChargeBalance[];
  }

  async openBalances(opts: FindChargesOptions): Promise<DbChargeBalance[]> {
    // The view carries no branch or customer columns, so scope through the
    // charges themselves and then read their balances.
    const charges = await this.find({ ...opts, openOnly: false });
    const balances = await this.balances(charges.map((c) => c.id));
    return balances.filter((b) => b.balance > 0);
  }

  async create(payload: CreateChargePayload): Promise<DbCharge> {
    const { data, error } = await this.db
      .from('charges')
      .insert(payload)
      .select(CHARGE_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCharge;
    this.audit({
      table: 'charges',
      recordId: created.id,
      action: 'create',
      after: created,
      customerId: created.customer_id ?? undefined,
      branchId: created.branch_id,
      subject: created.customers?.name ?? null,
    });
    return created;
  }

  /**
   * Upsert by id. A month bill's id is deterministic, so the device that gets
   * there second reuses the row instead of colliding on uq_charges_line_month.
   * `ignoreDuplicates` keeps the FIRST bill's frozen price — re-collecting a
   * month must not silently re-price it at today's rate.
   */
  async ensure(payload: CreateChargePayload): Promise<DbCharge> {
    const { data, error } = await this.db
      .from('charges')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
      .select(CHARGE_SELECT_LEAN)
      .maybeSingle();
    if (error) this.handleError(error);
    if (data) {
      const created = data as DbCharge;
      this.audit({
        table: 'charges',
        recordId: created.id,
        action: 'create',
        after: created,
        customerId: created.customer_id ?? undefined,
        branchId: created.branch_id,
        subject: created.customers?.name ?? null,
      });
      return created;
    }
    // Already existed — return what is on the server, price and all.
    const existing = await this.findById(payload.id);
    if (!existing) this.handleError(new Error('charge upsert returned nothing'));
    return existing;
  }

  async update(id: string, values: UpdateChargePayload): Promise<DbCharge> {
    const prior = await this.findById(id);
    return this.auditedUpdate<DbCharge>('charges', id, values, {
      select: CHARGE_SELECT_LEAN,
      branchColumn: null,
      audit: {
        branchId: prior?.branch_id ?? null,
        subject: prior?.customers?.name ?? null,
      },
    });
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCharge> {
    const prior = await this.findById(id);
    return this.auditedUpdate<DbCharge>(
      'charges',
      id,
      { voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason },
      {
        action: 'void',
        select: CHARGE_SELECT_LEAN,
        branchColumn: null,
        audit: { branchId: prior?.branch_id ?? null, subject: prior?.customers?.name ?? null },
      },
    );
  }

  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<DbCharge> {
    const prior = await this.findById(id);
    return this.auditedUpdate<DbCharge>(
      'charges',
      id,
      {
        written_off_at: new Date().toISOString(),
        written_off_by: writtenOffBy,
        write_off_reason: reason,
      },
      {
        // Not a void: the bill was real. The trail must be able to tell a
        // mistake from money the business gave up on.
        action: 'update',
        select: CHARGE_SELECT_LEAN,
        branchColumn: null,
        audit: { branchId: prior?.branch_id ?? null, subject: prior?.customers?.name ?? null },
      },
    );
  }

  async writtenOffInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<DbCharge[]> {
    let query = this.db
      .from('charges')
      .select(CHARGE_SELECT_LEAN)
      .not('written_off_at', 'is', null)
      .gte('written_off_at', startIso)
      .lt('written_off_at', endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, this.BRANCH_SCOPES.charges);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCharge[];
  }
}

export default Platform.OS === 'web'
  ? new ChargeRepository()
  : new OfflineChargeRepository();
