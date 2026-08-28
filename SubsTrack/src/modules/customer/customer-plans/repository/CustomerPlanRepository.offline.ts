import type { DbCustomerPlan, DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty, markDeleted } from '@/src/core/offline/db/dml';
import { newId, nowIso } from '@/src/core/offline/ids';
import type { CreateCustomerPlanPayload, ICustomerPlanRepository } from './ICustomerPlanRepository';

/** SQLite-backed customer_plans repository (service lines). Mirrors `'*, plans(*)'`. */
export class OfflineCustomerPlanRepository
  extends OfflineBaseRepository
  implements ICustomerPlanRepository
{
  /** Attach the joined plan (DbCustomerPlan.plans) from the local plans table. */
  private async hydrate(line: DbCustomerPlan): Promise<DbCustomerPlan> {
    if (!line.plan_id) return { ...line, plans: null };
    const plans = await this.rowsById<DbPlan>('plans', [line.plan_id]);
    return { ...line, plans: plans.get(line.plan_id) ?? null };
  }

  private async readById(id: string): Promise<DbCustomerPlan> {
    const row = await this.first('SELECT * FROM customer_plans WHERE id = ?', [id]);
    if (!row) this.handleError(new Error('Customer plan not found'));
    return this.hydrate(this.decodeOne<DbCustomerPlan>('customer_plans', row)!);
  }

  async create(payload: CreateCustomerPlanPayload): Promise<DbCustomerPlan> {
    const now = nowIso();
    const row: DbCustomerPlan = {
      id: newId(),
      customer_id: payload.customer_id,
      plan_id: payload.plan_id,
      start_date: payload.start_date,
      cancelled_at: null,
      active: true,
      custom_price: payload.custom_price,
      custom_currency_id: payload.custom_currency_id,
      tenant_id: payload.tenant_id,
      created_at: now,
      updated_at: now,
    };
    // Read before write() — the transaction must stay as short as possible.
    const owner = await this.customerAudit(payload.customer_id);
    await this.write(async (db) => {
      await insertDirty(db, 'customer_plans', row);
      await this.auditIn(db, {
        table: 'customer_plans',
        recordId: row.id,
        action: 'create',
        after: row,
        ...owner,
      });
    });
    return this.hydrate(row);
  }

  // Both single-row patches funnel through here: read, patch, record the diff.
  private async patch(
    id: string,
    patch: Record<string, unknown>,
    action: 'update' | 'restore',
  ): Promise<DbCustomerPlan> {
    await this.write(async (db) => {
      const before = this.decodeOne<DbCustomerPlan>(
        'customer_plans',
        await this.first('SELECT * FROM customer_plans WHERE id = ?', [id]),
      );
      await updateDirty(db, 'customer_plans', id, patch);
      const after = this.decodeOne<DbCustomerPlan>(
        'customer_plans',
        await this.first('SELECT * FROM customer_plans WHERE id = ?', [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: 'customer_plans',
          recordId: id,
          action,
          before,
          after,
          ...(await this.customerAudit(after.customer_id)),
        });
      }
    });
    return this.readById(id);
  }

  async update(
    id: string,
    payload: Partial<
      Pick<
        DbCustomerPlan,
        | 'plan_id'
        | 'start_date'
        | 'active'
        | 'cancelled_at'
        | 'custom_price'
        | 'custom_currency_id'
      >
    >,
  ): Promise<DbCustomerPlan> {
    // Re-activating a cancelled line reads as a restore, not a plain edit.
    const action = payload.active === true && payload.cancelled_at === null ? 'restore' : 'update';
    return this.patch(id, { ...payload, updated_at: nowIso() }, action);
  }

  async cancel(id: string): Promise<DbCustomerPlan> {
    const cancelledAt = nowIso();
    return this.patch(
      id,
      { active: false, cancelled_at: cancelledAt, updated_at: cancelledAt },
      'update',
    );
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db) => {
      const before = this.decodeOne<DbCustomerPlan>(
        'customer_plans',
        await this.first('SELECT * FROM customer_plans WHERE id = ?', [id]),
      );
      // Bills on this line cascade server-side; remove locally for consistency.
      // Only the line id is logged — the server FK cascade removes its bills.
      await db.runAsync(
        `DELETE FROM collection_items
          WHERE charge_id IN (SELECT id FROM charges WHERE customer_plan_id = ?)`,
        [id] as never[],
      );
      await db.runAsync('DELETE FROM charges WHERE customer_plan_id = ?', [id] as never[]);
      await db.runAsync('DELETE FROM customer_plans WHERE id = ?', [id] as never[]);
      await markDeleted(db, 'customer_plans', id);
      if (before) {
        await this.auditIn(db, {
          table: 'customer_plans',
          recordId: id,
          action: 'delete',
          before,
          ...(await this.customerAudit(before.customer_id)),
        });
      }
    });
  }

  async countPayments(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM charges WHERE customer_plan_id = ?', [id]);
  }

  async findPaidLineIds(customerId: string): Promise<string[]> {
    // One collection_item row IS money standing on that line — see the web twin.
    const rows = await this.all<{ customer_plan_id: string }>(
      `SELECT DISTINCT c.customer_plan_id AS customer_plan_id
         FROM charges c
         JOIN collection_items i ON i.charge_id = c.id
         JOIN collections p ON p.id = i.collection_id AND p.voided_at IS NULL
        WHERE c.customer_id = ? AND c.customer_plan_id IS NOT NULL`,
      [customerId],
    );
    return rows.map((r) => r.customer_plan_id);
  }
}
