import type { BranchFilter } from "@shared/core/constants";
import { OFFLINE_PAGE_SIZE } from "@shared/core/constants";
import type { DbCustomer, DbCustomerPlan, DbPlan } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import {
  insertDirty,
  updateDirty,
  markDeleted,
} from "@/src/core/offline/db/dml";
import { newId, nowIso } from "@shared/core/utils/ids";
import type {
  CreateCustomerPayload,
  CustomerWithLines,
  ICustomerRepository,
} from "@shared/modules/customer/customers/repository/ICustomerRepository";

/** SQLite-backed customers repository. Reproduces `'*, customer_plans(*, plans(*))'`. */
export class OfflineCustomerRepository
  extends OfflineBaseRepository
  implements ICustomerRepository
{
  private async hydrateLines(
    customers: DbCustomer[],
  ): Promise<CustomerWithLines[]> {
    if (customers.length === 0) return customers;
    const linesByCustomer = await this.childrenByParent<DbCustomerPlan>(
      "customer_plans",
      "customer_id",
      customers.map((c) => c.id),
    );
    const planIds = [...linesByCustomer.values()]
      .flat()
      .map((l) => l.plan_id)
      .filter((p): p is string => !!p);
    const plans = await this.rowsById<DbPlan>("plans", planIds);
    return customers.map((c) => ({
      ...c,
      customer_plans: (linesByCustomer.get(c.id) ?? []).map((line) => ({
        ...line,
        plans: line.plan_id ? (plans.get(line.plan_id) ?? null) : null,
      })),
    }));
  }

  async findAll(
    page: number,
    searchQuery?: string,
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const { sql: where, params } = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
      this.searchWhere(
        ["name", "phone_number", "address", "area"],
        searchQuery,
      ),
    ]);
    const from = page * OFFLINE_PAGE_SIZE;
    const rows = await this.all(
      `SELECT * FROM customers ${where} ORDER BY name LIMIT ${OFFLINE_PAGE_SIZE} OFFSET ${from}`,
      params,
    );
    return this.hydrateLines(this.decodeAll<DbCustomer>("customers", rows));
  }

  async findAllForStatus(
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const branch = this.branchWhere(
      branchFilter,
      this.BRANCH_SCOPES.customers,
      "customers",
    );
    const rows = await this.all(
      `SELECT * FROM customers
       WHERE active = 1 AND is_regular = 1
         ${branch.clause ? `AND ${branch.clause}` : ""}
       ORDER BY name`,
      branch.params,
    );
    return this.hydrateLines(this.decodeAll<DbCustomer>("customers", rows));
  }

  async findEveryWithLines(
    branchFilter: BranchFilter = null,
  ): Promise<CustomerWithLines[]> {
    const { sql: where, params } = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
    ]);
    const rows = await this.all(
      `SELECT * FROM customers ${where} ORDER BY name`,
      params,
    );
    return this.hydrateLines(this.decodeAll<DbCustomer>("customers", rows));
  }

  async findById(id: string): Promise<CustomerWithLines> {
    const row = await this.first("SELECT * FROM customers WHERE id = ?", [id]);
    if (!row) this.handleError(new Error("Customer not found"));
    const [hydrated] = await this.hydrateLines([
      this.decodeOne<DbCustomer>("customers", row)!,
    ]);
    return hydrated;
  }

  async create(payload: CreateCustomerPayload): Promise<CustomerWithLines> {
    const now = nowIso();
    const row: DbCustomer = {
      id: newId(),
      created_at: now,
      updated_at: now,
      ...payload,
    };
    await this.write(async (db) => {
      await insertDirty(db, "customers", row);
      await this.auditIn(db, {
        table: "customers",
        recordId: row.id,
        action: "create",
        after: row,
        branchId: row.branch_id,
      });
    });
    return { ...row, customer_plans: [] };
  }

  private async patch(
    id: string,
    patch: Record<string, unknown>,
    action: "update" | "restore",
  ): Promise<CustomerWithLines> {
    await this.write(async (db) => {
      const before = this.decodeOne<DbCustomer>(
        "customers",
        await this.first("SELECT * FROM customers WHERE id = ?", [id]),
      );
      await updateDirty(db, "customers", id, patch);
      const after = this.decodeOne<DbCustomer>(
        "customers",
        await this.first("SELECT * FROM customers WHERE id = ?", [id]),
      );
      if (before && after) {
        await this.auditIn(db, {
          table: "customers",
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
        | "name"
        | "phone_number"
        | "address"
        | "area"
        | "notes"
        | "location_url"
        | "branch_id"
        | "is_regular"
      >
    >,
  ): Promise<CustomerWithLines> {
    return this.patch(id, { ...payload, updated_at: nowIso() }, "update");
  }

  async deactivate(id: string): Promise<CustomerWithLines> {
    const cancelledAt = nowIso();
    return this.patch(
      id,
      { active: false, cancelled_at: cancelledAt, updated_at: cancelledAt },
      "update",
    );
  }

  async reactivate(id: string): Promise<CustomerWithLines> {
    return this.patch(
      id,
      { active: true, cancelled_at: null, updated_at: nowIso() },
      "restore",
    );
  }

  async countPayments(id: string): Promise<number> {
    const [charges, collections] = await Promise.all([
      this.count("SELECT COUNT(*) AS n FROM charges WHERE customer_id = ?", [
        id,
      ]),
      this.count(
        "SELECT COUNT(*) AS n FROM collections WHERE customer_id = ?",
        [id],
      ),
    ]);
    return charges + collections;
  }

  async delete(id: string): Promise<void> {
    await this.deleteMany([id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.write(async (db) => {
      for (const id of ids) {
        const before = this.decodeOne<DbCustomer>(
          "customers",
          await this.first("SELECT * FROM customers WHERE id = ?", [id]),
        );
        await db.runAsync(
          `DELETE FROM collection_items
            WHERE collection_id IN (SELECT id FROM collections WHERE customer_id = ?)
               OR charge_id IN (SELECT id FROM charges WHERE customer_id = ?)`,
          [id, id] as never[],
        );
        await db.runAsync("DELETE FROM collections WHERE customer_id = ?", [
          id,
        ] as never[]);
        await db.runAsync("DELETE FROM charges WHERE customer_id = ?", [
          id,
        ] as never[]);
        await db.runAsync("DELETE FROM customer_plans WHERE customer_id = ?", [
          id,
        ] as never[]);
        await db.runAsync("DELETE FROM customers WHERE id = ?", [
          id,
        ] as never[]);
        await markDeleted(db, "customers", id);
        if (before) {
          await this.auditIn(db, {
            table: "customers",
            recordId: id,
            action: "delete",
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
          "customers",
          await this.first("SELECT * FROM customers WHERE id = ?", [id]),
        );
        await updateDirty(db, "customers", id, {
          active: false,
          cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        });
        if (before) {
          await this.auditIn(db, {
            table: "customers",
            recordId: id,
            action: "update",
            before,
            after: { ...before, active: false, cancelled_at: cancelledAt },
            branchId: before.branch_id,
          });
        }
      }
    });
  }

  async customersWithPayments(ids: string[]): Promise<Set<string>> {
    const [charges, collections] = await Promise.all([
      this.referencedIdsIn("charges", "customer_id", ids),
      this.referencedIdsIn("collections", "customer_id", ids),
    ]);
    return new Set([...charges, ...collections]);
  }

  async countAll(branchFilter: BranchFilter = null): Promise<number> {
    const { sql, params } = this.combineWhere([
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countActive(branchFilter: BranchFilter = null): Promise<number> {
    const { sql, params } = this.combineWhere([
      { clause: "active = 1", params: [] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countCreatedInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      {
        clause: "created_at >= ? AND created_at < ?",
        params: [start, endExclusive],
      },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }

  async countCancelledInRange(
    start: string,
    endExclusive: string,
    branchFilter: BranchFilter = null,
  ): Promise<number> {
    const { sql, params } = this.combineWhere([
      {
        clause: "cancelled_at >= ? AND cancelled_at < ?",
        params: [start, endExclusive],
      },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.customers, "customers"),
    ]);
    return this.count(`SELECT COUNT(*) AS n FROM customers ${sql}`, params);
  }
}
