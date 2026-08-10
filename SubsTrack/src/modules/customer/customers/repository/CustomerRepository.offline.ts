import type { BranchFilter } from '@/src/core/constants';
import { OFFLINE_PAGE_SIZE } from '@/src/core/constants';
import type { DbCustomer, DbCustomerPlan, DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, markDeleted } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type {
  CreateCustomerPayload,
  CustomerWithLines,
  ICustomerRepository,
} from './ICustomerRepository';

/** SQLite-backed customers repository. Reproduces `'*, customer_plans(*, plans(*))'`. */
export class OfflineCustomerRepository
  extends OfflineBaseRepository
  implements ICustomerRepository {
  /** Attach `customer_plans` (each with its joined `plans`) to a set of customers. */
  private async hydrateLines(customers: DbCustomer[]): Promise<CustomerWithLines[]> {
    if (customers.length === 0) return customers;
    const linesByCustomer = await this.childrenByParent<DbCustomerPlan>(
      'customer_plans',
      'customer_id',
      customers.map((c) => c.id),
    );
    const planIds = [...linesByCustomer.values()]
      .flat()
      .map((l) => l.plan_id)
      .filter((p): p is string => !!p);
    const plans = await this.rowsById<DbPlan>('plans', planIds);
    return customers.map((c) => ({
      ...c,
      customer_plans: (linesByCustomer.get(c.id) ?? []).map((line) => ({
        ...line,
        plans: line.plan_id ? plans.get(line.plan_id) ?? null : null,
      })),
    }));
  }

  async findAll(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const { sql: where, params } = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, 'customers'),
      this.searchWhere(['name', 'phone_number', 'address', 'area'], searchQuery),
    ]);
    const from = page * OFFLINE_PAGE_SIZE;
    const rows = await this.all(
      `SELECT * FROM customers ${where} ORDER BY name LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${from}`,
      params,
    );
    return this.hydrateLines(this.decodeAll<DbCustomer>('customers', rows));
  }

  async findById(id: string): Promise<CustomerWithLines> {
    const row = await this.first('SELECT * FROM customers WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Customer not found'));
    const [hydrated] = await this.hydrateLines([this.decodeOne<DbCustomer>('customers', row)!]);
    return hydrated;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithLines> {
    const now = nowIso();
    const row: DbCustomer = { id: newId(), created_at: now, updated_at: now, ...payload };
    await this.write(async (db) => {
      await insertDirty(db, 'customers', row);
      await this.auditIn(db, {
        table: 'customers',
        recordId: row.id,
        action: 'create',
        after: row,
        branchId: row.branch_id,
      });
    });
    return { ...row, customer_plans: [] };
  }

  // Every single-row customer edit funnels through here: read the row, patch it,
  // record the diff — all inside one transaction.
  private async patch(
    id: string,
    patch: Record<string, unknown>,
    action: 'update' | 'restore',
  ): Promise<CustomerWithLines> {
    await this.write(async (db) => {
      const before = this.decodeOne<DbCustomer>(
        'customers',
        await this.first('SELECT * FROM customers WHERE id = ?', [id]),
      );
      await updateDirty(db, 'customers', id, patch);
      const after = this.decodeOne<DbCustomer>(
        'customers',
        await this.first('SELECT * FROM customers WHERE id = ?', [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: 'customers',
          recordId: id,
          action,
          before,
          after,
          branchId: after.branch_id,
        });
      }
    });
    return this.findById(id);
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomer,
        'name' | 'phone_number' | 'address' | 'area' | 'notes' | 'location_url' | 'branch_id' | 'is_regular'
      >
    >,
  ): Promise<CustomerWithLines> {
    return this.patch(id, { ...payload, updated_at: nowIso() }, 'update');
  }

  async deactivate(id: string): Promise<CustomerWithLines> {
    const cancelledAt = nowIso();
    return this.patch(
      id,
      { active: false, cancelled_at: cancelledAt, updated_at: cancelledAt },
      'update',
    );
  }

  async reactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(
      id,
      { active: true, cancelled_at: null, updated_at: nowIso() },
      'restore',
    );
  }

  async countPayments(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM payments WHERE customer_id = ?', [id]);
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        // Snapshot before the row is gone — a delete's whole value in the trail is
        // the copy of what was removed. The cascaded children get no entry of
        // their own; the customer entry is the record of the whole removal.
        const before = this.decodeOne<DbCustomer>(
          'customers',
          await this.first('SELECT * FROM customers WHERE id = ?', [id]),
        );
        // Children cascade server-side; delete locally for immediate consistency.
        // Only the customer id is logged — the server FK cascade removes children.
        await db.runAsync('DELETE FROM payments WHERE customer_id = ?', [id] as never[]);
        await db.runAsync('DELETE FROM customer_plans WHERE customer_id = ?', [id] as never[]);
        await db.runAsync('DELETE FROM customers WHERE id = ?', [id] as never[]);
        await markDeleted(db, 'customers', id);
        if (before) {
          await this.auditIn(db, {
            table: 'customers',
            recordId: id,
            action: 'delete',
            before,
            branchId: before.branch_id,
          });
        }
      }
    });
  }

  async deactivateMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const cancelledAt = nowIso();
    await this.write(async (db) => {
      for (const id of ids) {
        const before = this.decodeOne<DbCustomer>(
          'customers',
          await this.first('SELECT * FROM customers WHERE id = ?', [id]),
        );
        await updateDirty(db, 'customers', id, {
          active: false,
          cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        });
        if (before) {
          await this.auditIn(db, {
            table: 'customers',
            recordId: id,
            action: 'update',
            before,
            after: { ...before, active: false, cancelled_at: cancelledAt },
            branchId: before.branch_id,
          });
        }
      }
    });
  }

  async customersWithPayments(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn('payments', 'customer_id', ids);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const { sql, params } = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, 'customers'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: 'active = 1', params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, 'customers'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countCreatedInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: 'created_at >= ? AND created_at < ?', params: [start, endExclusive] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, 'customers'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countCancelledInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: 'cancelled_at >= ? AND cancelled_at < ?', params: [start, endExclusive] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, 'customers'),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  // Reuses the ONLINE JS aggregation verbatim; only the two fetches become local
  // SQL (see CustomerRepository.countUnpaidForMonth). Must stay in sync with it.
  async countUnpaidForMonth(
    billingMonth: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const [year, monthStr] = billingMonth.split('-').map(Number);
    const cutoffDate = new Date(year, monthStr - 1 - 12, 1);
    const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}-01`;
    const target = new Date(billingMonth);

    // (a) Covering payments — join customers for the inherited branch filter.
    const pBranch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.payments, 'c');
    const payments = await this.all<{
      customer_plan_id: string;
      billing_month: string;
      duration_months: number;
    }>(
      `SELECT p.customer_plan_id, p.billing_month, p.duration_months
       FROM payments p JOIN customers c ON p.customer_id = c.id
       WHERE p.billing_month <= ? AND p.billing_month >= ? AND p.voided_at IS NULL
         AND CAST(p.amount_paid AS REAL) > 0
         ${pBranch.clause ? `AND ${pBranch.clause}` : ''}`,
      [billingMonth, cutoff, ...pBranch.params],
    );

    const coveredLineIds = new Set(
      payments
        .filter((r) => {
          const start = new Date(r.billing_month);
          const end = new Date(start);
          end.setMonth(end.getMonth() + r.duration_months - 1);
          return end >= target;
        })
        .map((r) => r.customer_plan_id),
    );

    // (a2) Lines whose month is skipped — nothing is owed, so they never count.
    const skipRows = await this.all<{ customer_plan_id: string }>(
      'SELECT customer_plan_id FROM skipped_months WHERE billing_month = ? AND skipped = 1',
      [billingMonth],
    );
    const skippedLineIds = new Set(skipRows.map((r) => r.customer_plan_id));

    // (b) Active lines on active, regular customers — inherited branch filter.
    const lBranch = this.branchWhere(branchFilter, this.BRANCH_SCOPES.customer_plans, 'c');
    const lines = await this.all<{ id: string; customer_id: string; start_date: string }>(
      `SELECT cp.id, cp.customer_id, cp.start_date
       FROM customer_plans cp JOIN customers c ON cp.customer_id = c.id
       WHERE cp.active = 1 AND c.active = 1 AND c.is_regular = 1
         ${lBranch.clause ? `AND ${lBranch.clause}` : ''}`,
      lBranch.params,
    );

    const unpaidCustomers = new Set<string>();
    for (const l of lines) {
      const [sy, sm] = l.start_date.split('-').map(Number);
      if (new Date(`${sy}-${String(sm).padStart(2, '0')}-01`) > target) continue; // not started yet
      if (skippedLineIds.has(l.id)) continue; // skipped month — not owed
      if (!coveredLineIds.has(l.id)) unpaidCustomers.add(l.customer_id);
    }
    return unpaidCustomers.size;
  }
}
