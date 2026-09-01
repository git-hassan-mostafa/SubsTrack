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

// A bill with everything a label needs. The customer join is LEFT — a walk-in
// sale charge has none.
const CHARGE_SELECT = '*, customers(*), customer_plans(*, plans(*)), sales(*)';
const CHARGE_SELECT_LEAN = '*, customers(*)';

// `charge_balances` also exposes the bill's scoping columns (branch, customer,
// line, kind, dates) so "which bills still owe?" is answered ON THE SERVER.
// These five are the balance itself — the shape `DbChargeBalance` promises.
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
    // Two reads, in PARALLEL and scoped the same way — never one read feeding
    // the other an id list. Both are reads, so there is no order to keep.
    const [{ data, error }, paid] = await Promise.all([
      this.db
        .from('charges')
        .select('*')
        .eq('kind', 'month')
        .in('customer_plan_id', customerPlanIds)
        // A voided bill is invisible to the grid, exactly as a voided payment was.
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

  /**
   * What is STILL OWED, decided ON THE SERVER.
   *
   * A void ("never existed") and a write-off ("real, but given up on") both stop
   * a bill being owed, so both are excluded here — the one place that decides it.
   * `charge_balances` excludes only the void: money already collected stays
   * collected (#115), so the write-off filter rides on top.
   *
   * Two round trips, and neither is unbounded. The old shape downloaded EVERY
   * bill the tenant had ever raised — with four nested joins — and then posted
   * every id back in an `in.(…)` query string just to keep the open few (#118).
   * Now the view answers "which, and how much has reached them" from a filter,
   * and only those bills are fetched with their labels.
   */
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

    // `findByIds` promises no order, so the view's due-date order is re-applied
    // here rather than sorted a second time.
    const byId = new Map((await this.findByIds(open.map((o) => o.id))).map((r) => [r.id, r]));
    return open
      .filter((o) => byId.has(o.id))
      .map((o) => ({ charge: byId.get(o.id)!, paid: Number(o.paid) }));
  }

  // For a SMALL, known set of ids (one bill's void check). To ask "which of a
  // whole scope still owe?", filter the view instead — never post every id back.
  async balances(chargeIds: string[]): Promise<DbChargeBalance[]> {
    if (chargeIds.length === 0) return [];
    const { data, error } = await this.db
      .from('charge_balances')
      .select(BALANCE_COLUMNS)
      .in('id', chargeIds);
    if (error) this.handleError(error);
    return (data ?? []) as DbChargeBalance[];
  }

  /** The month bills' balances, scoped exactly as the bills were — `id → paid`.
   *  Scoped, never listed by id: the id list is the whole problem (#118). */
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
      // Not a void: the bill was real. The trail must be able to tell a
      // mistake from money the business gave up on.
      'update',
    );
  }

  /**
   * Every column write on a bill: patch it, and record the diff. The twin of
   * the offline `patch` (#119), and the reason this is not `auditedUpdate`:
   * that helper reads the prior row itself, so the extra `findById` these three
   * used to make — purely for the branch and the customer's name — was a THIRD
   * round trip for facts the UPDATE's own `select` already returns.
   *
   * The prior read cannot be parallelised with the UPDATE: it would race it and
   * could snapshot the row already changed, which is a silently empty diff.
   */
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
