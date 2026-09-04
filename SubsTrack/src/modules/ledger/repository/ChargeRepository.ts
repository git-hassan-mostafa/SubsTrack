import { Platform } from 'react-native';
import { BaseRepository } from '@/src/core/utils/BaseRepository';
import type { BranchFilter } from '@/src/core/constants';
import type { DbCharge, DbChargeBalance } from '@/src/core/types/db';
import type {
  CreateChargePayload,
  DbChargeWithPaid,
  FindChargesOptions,
  IChargeRepository,
  UpdateChargePayload,
} from './IChargeRepository';
import { OfflineChargeRepository } from './ChargeRepository.offline';

const CHARGE_SELECT = '*, customers(*), customer_plans(*, plans(*)), sales(*)';
const CHARGE_SELECT_LEAN = '*, customers(*)';

const BALANCE_COLUMNS = 'id, tenant_id, amount, paid, balance';

/** Pair each bill with what has reached it; a bill with no items paid nothing. */
function attachPaid(rows: DbCharge[], paid: Map<string, number>): DbChargeWithPaid[] {
  return rows.map((charge) => ({ charge, paid: paid.get(charge.id) ?? 0 }));
}

/** `id → paid`, from any `charge_balances` projection carrying the two. */
function toPaidMap(rows: unknown): Map<string, number> {
  return new Map(
    ((rows ?? []) as { id: string; paid: number }[]).map((r) => [r.id, Number(r.paid)]),
  );
}

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

  async findMonthChargesForLines(customerPlanIds: string[]): Promise<DbChargeWithPaid[]> {
    if (customerPlanIds.length === 0) return [];
    const [{ data, error }, paid] = await Promise.all([
      this.db
        .from('charges')
        .select('*')
        .eq('kind', 'month')
        .in('customer_plan_id', customerPlanIds)
        .is('voided_at', null)
        .order('billing_month', { ascending: true }),
      this.monthPaid('customer_plan_id', customerPlanIds),
    ]);
    if (error) this.handleError(error);
    return attachPaid((data ?? []) as DbCharge[], paid);
  }

  async findMonthChargesForCustomer(customerId: string): Promise<DbChargeWithPaid[]> {
    const [{ data, error }, paid] = await Promise.all([
      this.db
        .from('charges')
        .select('*')
        .eq('kind', 'month')
        .eq('customer_id', customerId)
        .is('voided_at', null)
        .order('billing_month', { ascending: true }),
      this.monthPaid('customer_id', [customerId]),
    ]);
    if (error) this.handleError(error);
    return attachPaid((data ?? []) as DbCharge[], paid);
  }

  async findBySaleIds(saleIds: string[]): Promise<DbCharge[]> {
    if (saleIds.length === 0) return [];
    const { data, error } = await this.db
      .from('charges')
      .select(CHARGE_SELECT_LEAN)
      .in('sale_id', saleIds);
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

  async findOpenWithPaid(opts: FindChargesOptions): Promise<DbChargeWithPaid[]> {
    let query = this.db
      .from('charge_balances')
      .select('id, paid')
      .is('written_off_at', null)
      .gt('balance', 0);
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    if (opts.customerIds?.length) query = query.in('customer_id', opts.customerIds);
    if (opts.kinds?.length) query = query.in('kind', opts.kinds);
    query = this.applyBranchFilter(query, opts.branchFilter ?? null, this.BRANCH_SCOPES.charges);
    const { data, error } = await query.order('due_date', { ascending: true });
    if (error) this.handleError(error);
    const open = (data ?? []) as { id: string; paid: number }[];
    if (open.length === 0) return [];

    const byId = new Map((await this.findByIds(open.map((o) => o.id))).map((r) => [r.id, r]));
    return open
      .filter((o) => byId.has(o.id))
      .map((o) => ({ charge: byId.get(o.id)!, paid: Number(o.paid) }));
  }

  async balances(chargeIds: string[]): Promise<DbChargeBalance[]> {
    if (chargeIds.length === 0) return [];
    const { data, error } = await this.db
      .from('charge_balances')
      .select(BALANCE_COLUMNS)
      .in('id', chargeIds);
    if (error) this.handleError(error);
    return (data ?? []) as DbChargeBalance[];
  }

  private async monthPaid(
    column: 'customer_plan_id' | 'customer_id',
    values: string[],
  ): Promise<Map<string, number>> {
    const { data, error } = await this.db
      .from('charge_balances')
      .select('id, paid')
      .eq('kind', 'month')
      .in(column, values);
    if (error) this.handleError(error);
    return toPaidMap(data);
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
    const existing = await this.findById(payload.id);
    if (!existing) this.handleError(new Error('charge upsert returned nothing'));
    return existing;
  }

  async update(id: string, values: UpdateChargePayload): Promise<DbCharge> {
    return this.patch(id, values, 'update');
  }

  async void(id: string, voidedBy: string, reason: string | null): Promise<DbCharge> {
    return this.patch(
      id,
      { voided_at: new Date().toISOString(), voided_by: voidedBy, void_reason: reason },
      'void',
    );
  }

  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<DbCharge> {
    return this.patch(
      id,
      {
        written_off_at: new Date().toISOString(),
        written_off_by: writtenOffBy,
        write_off_reason: reason,
      },
      'update',
    );
  }

  private async patch(
    id: string,
    values: object,
    action: 'void' | 'update',
  ): Promise<DbCharge> {
    const { data: prior } = await this.db
      .from('charges')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await this.db
      .from('charges')
      .update(values)
      .eq('id', id)
      .select(CHARGE_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const after = data as DbCharge;
    this.audit({
      table: 'charges',
      recordId: id,
      action,
      before: prior as DbCharge | null,
      after,
      customerId: after.customer_id ?? undefined,
      branchId: after.branch_id,
      subject: after.customers?.name ?? null,
    });
    return after;
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
