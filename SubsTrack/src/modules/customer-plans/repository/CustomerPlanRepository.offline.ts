import type { DbCustomerPlan, DbPlan } from '@/src/core/types/db';
import { OfflineBaseRepository } from '@/src/core/offline/OfflineBaseRepository';
import { insertDirty, updateDirty } from '@/src/core/offline/db/dml';
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
      tenant_id: payload.tenant_id,
      created_at: now,
      updated_at: now,
    };
    await this.write(async (db, queue) => {
      await insertDirty(db, 'customer_plans', row);
      await queue({ tableName: 'customer_plans', opType: 'insert', rowId: row.id, payload: { row } });
    });    return this.hydrate(row);
  }

  async update(
    id: string,
    payload: Partial<Pick<DbCustomerPlan, 'plan_id' | 'start_date'>>,
  ): Promise<DbCustomerPlan> {
    await this.write(async (db, queue) => {
      await updateDirty(db, 'customer_plans', id, { ...payload, updated_at: nowIso() });
      await queue({ tableName: 'customer_plans', opType: 'update', rowId: id, payload: { fields: payload } });
    });    return this.readById(id);
  }

  async cancel(id: string): Promise<DbCustomerPlan> {
    const cancelledAt = nowIso();
    await this.write(async (db, queue) => {
      await updateDirty(db, 'customer_plans', id, {
        active: false,
        cancelled_at: cancelledAt,
        updated_at: cancelledAt,
      });
      await queue({
        tableName: 'customer_plans',
        opType: 'soft_delete',
        rowId: id,
        payload: { fields: { active: false, cancelled_at: cancelledAt } },
      });
    });    return this.readById(id);
  }

  async delete(id: string): Promise<void> {
    await this.write(async (db, queue) => {
      // Payments on this line cascade server-side; remove locally for consistency.
      await db.runAsync('DELETE FROM payments WHERE customer_plan_id = ?', [id] as never[]);
      await db.runAsync('DELETE FROM customer_plans WHERE id = ?', [id] as never[]);
      await queue({ tableName: 'customer_plans', opType: 'hard_delete', rowId: id, payload: {} });
    });  }

  async countPayments(id: string): Promise<number> {
    return this.count('SELECT COUNT(*) AS n FROM payments WHERE customer_plan_id = ?', [id]);
  }
}
