import { OFFLINE_PAGE_SIZE, type BranchFilter } from "@/src/core/constants";
import type {
  DbCharge,
  DbChargeBalance,
  DbCustomer,
  DbCustomerPlan,
  DbPlan,
  DbSale,
} from "@/src/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { insertDirty, updateDirty } from "@/src/core/offline/db/dml";
import { nowIso } from "@/src/core/offline/ids";
import type {
  CreateChargePayload,
  DbChargeHistoryRow,
  DbChargeWithPaid,
  FindChargeHistoryOptions,
  FindChargesOptions,
  IChargeRepository,
  UpdateChargePayload,
} from "./IChargeRepository";
import { writeOffRevertPatch } from "./chargeRevive";

const PAID_SUM = `COALESCE(SUM(CASE WHEN co.id IS NOT NULL AND co.voided_at IS NULL
                     THEN CAST(i.amount AS REAL) ELSE 0 END), 0)`;
const PAID_JOIN = `LEFT JOIN collection_items i ON i.charge_id = c.id
   LEFT JOIN collections co ON co.id = i.collection_id`;

// The mirror's twin of the view's `down_paid` — what the bill took on the day it
// was raised. Correlated rather than joined so it survives the outer GROUP BY.
const DOWN_PAID = `COALESCE((
     SELECT SUM(CAST(i2.amount AS REAL))
       FROM collection_items i2
       JOIN collections p2 ON p2.id = i2.collection_id
      WHERE i2.charge_id = c.id AND p2.voided_at IS NULL
        AND p2.received_at = (
            SELECT MIN(p3.received_at)
              FROM collection_items i3
              JOIN collections p3 ON p3.id = i3.collection_id
             WHERE i3.charge_id = c.id AND p3.voided_at IS NULL)
   ), 0)`;

/**
 * SQLite-backed bills. Reproduces
 * `'*, customers(*), customer_plans(*, plans(*)), sales(*)'`.
 *
 * The `charge_balances` view has no local twin: the mirror stores only the three
 * base tables and the balance is the SAME `GROUP BY` the server runs, so both
 * sides answer from the raw items and can never drift into disagreeing.
 */
export class OfflineChargeRepository
  extends OfflineBaseRepository
  implements IChargeRepository
{
  private async hydrate(charges: DbCharge[]): Promise<DbCharge[]> {
    if (charges.length === 0) return charges;
    const customers = await this.rowsById<DbCustomer>(
      "customers",
      charges.map((c) => c.customer_id).filter((x): x is string => !!x),
    );
    const lines = await this.rowsById<DbCustomerPlan>(
      "customer_plans",
      charges.map((c) => c.customer_plan_id).filter((x): x is string => !!x),
    );
    const plans = await this.rowsById<DbPlan>(
      "plans",
      [...lines.values()].map((l) => l.plan_id).filter((x): x is string => !!x),
    );
    const sales = await this.rowsById<DbSale>(
      "sales",
      charges.map((c) => c.sale_id).filter((x): x is string => !!x),
    );
    return charges.map((c) => {
      const line = c.customer_plan_id
        ? (lines.get(c.customer_plan_id) ?? null)
        : null;
      return {
        ...c,
        customers: c.customer_id
          ? (customers.get(c.customer_id) ?? null)
          : null,
        customer_plans: line
          ? {
              ...line,
              plans: line.plan_id ? (plans.get(line.plan_id) ?? null) : null,
            }
          : null,
        sales: c.sale_id ? (sales.get(c.sale_id) ?? null) : null,
      };
    });
  }

  async findById(id: string): Promise<DbCharge | null> {
    const row = await this.first<Record<string, unknown>>(
      "SELECT * FROM charges WHERE id = ?",
      [id],
    );
    const decoded = this.decodeOne<DbCharge>("charges", row);
    if (!decoded) return null;
    return (await this.hydrate([decoded]))[0];
  }

  async findByIds(ids: string[]): Promise<DbCharge[]> {
    if (ids.length === 0) return [];
    const rows = await this.all(
      `SELECT * FROM charges WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    return this.hydrate(this.decodeAll<DbCharge>("charges", rows));
  }

  async findMonthChargesForLines(
    customerPlanIds: string[],
  ): Promise<DbChargeWithPaid[]> {
    if (customerPlanIds.length === 0) return [];
    return this.monthChargesWithPaid(
      `c.customer_plan_id IN (${customerPlanIds.map(() => "?").join(",")})`,
      customerPlanIds,
    );
  }

  async findMonthChargesForCustomer(
    customerId: string,
  ): Promise<DbChargeWithPaid[]> {
    return this.monthChargesWithPaid("c.customer_id = ?", [customerId]);
  }

  private async monthChargesWithPaid(
    scope: string,
    params: unknown[],
  ): Promise<DbChargeWithPaid[]> {
    const rows = await this.all<Record<string, unknown>>(
      `SELECT c.*, ${PAID_SUM} AS __paid
         FROM charges c ${PAID_JOIN}
        WHERE c.kind = 'month' AND c.voided_at IS NULL AND ${scope}
        GROUP BY c.id
        ORDER BY c.billing_month ASC`,
      params,
    );
    return this.withPaid(rows);
  }

  async findBySaleIds(saleIds: string[]): Promise<DbCharge[]> {
    if (saleIds.length === 0) return [];
    const ph = saleIds.map(() => "?").join(", ");
    const rows = await this.all(
      `SELECT * FROM charges WHERE sale_id IN (${ph})`,
      saleIds,
    );
    return this.hydrate(this.decodeAll<DbCharge>("charges", rows));
  }

  async findBySaleId(saleId: string): Promise<DbCharge | null> {
    const row = await this.first<Record<string, unknown>>(
      "SELECT * FROM charges WHERE sale_id = ?",
      [saleId],
    );
    const decoded = this.decodeOne<DbCharge>("charges", row);
    if (!decoded) return null;
    return (await this.hydrate([decoded]))[0];
  }

  private owedWhere(opts: FindChargesOptions): {
    sql: string;
    params: unknown[];
  } {
    const writeOff =
      opts.writeOffScope === "written_off"
        ? " AND c.written_off_at IS NOT NULL"
        : opts.writeOffScope === "any"
          ? ""
          : " AND c.written_off_at IS NULL";
    const parts: { clause: string; params: unknown[] }[] = [
      { clause: `c.voided_at IS NULL${writeOff}`, params: [] },
    ];
    if (opts.customerId)
      parts.push({ clause: "c.customer_id = ?", params: [opts.customerId] });
    if (opts.customerIds?.length) {
      parts.push({
        clause: `c.customer_id IN (${opts.customerIds.map(() => "?").join(",")})`,
        params: opts.customerIds,
      });
    }
    if (opts.kinds?.length) {
      parts.push({
        clause: `c.kind IN (${opts.kinds.map(() => "?").join(",")})`,
        params: opts.kinds,
      });
    }
    parts.push(
      this.branchWhere(
        opts.branchFilter ?? null,
        this.BRANCH_SCOPES.charges,
        "c",
      ),
    );
    return this.combineWhere(parts);
  }

  async findOpenWithPaid(
    opts: FindChargesOptions,
  ): Promise<DbChargeWithPaid[]> {
    const where = this.owedWhere(opts);
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT c.*, ${PAID_SUM} AS __paid
           FROM charges c ${PAID_JOIN}
          ${where.sql}
          GROUP BY c.id
       )
        WHERE CAST(amount AS REAL) - __paid > 0
        ORDER BY due_date ASC`,
      where.params,
    );
    const open = this.withPaid(rows);
    const hydrated = await this.hydrate(open.map((o) => o.charge));
    return hydrated.map((charge, i) => ({ charge, paid: open[i].paid }));
  }

  // The same GROUP BY as the debts read, without its `> 0` gate. `id` breaks the
  // sort tie so paging cannot repeat or skip a row (mirrors the online order).
  async findHistory(
    opts: FindChargeHistoryOptions,
  ): Promise<DbChargeHistoryRow[]> {
    const where = this.owedWhere(opts);
    const params = [...where.params];
    const dateParts: string[] = [];
    if (opts.fromDate) {
      dateParts.push("AND c.due_date >= ?");
      params.push(opts.fromDate);
    }
    if (opts.toDate) {
      dateParts.push("AND c.due_date <= ?");
      params.push(opts.toDate);
    }
    const owed = "CAST(amount AS REAL) - __paid > 0";
    const balance =
      opts.balanceScope === "settled"
        ? "WHERE CAST(amount AS REAL) - __paid <= 0"
        : opts.balanceScope === "partial"
          ? `WHERE ${owed} AND __paid > 0`
          : opts.balanceScope === "unpaid"
            ? `WHERE ${owed} AND __paid = 0`
            : "";
    const dir = opts.sortDirection === "asc" ? "ASC" : "DESC";
    const sortCol =
      opts.sortField === "amount"
        ? "CAST(amount AS REAL)"
        : (opts.sortField ?? "due_date");
    params.push(opts.limit ?? OFFLINE_PAGE_SIZE, opts.offset ?? 0);
    // `__down_paid < amount` IS the list — a bill settled the moment it was
    // raised never became a debt, so it is excluded here rather than filtered
    // out afterwards, which would shorten a page and strand the paging.
    const became = `${balance ? "AND" : "WHERE"} __down_paid < CAST(amount AS REAL)`;
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT c.*, ${PAID_SUM} AS __paid, ${DOWN_PAID} AS __down_paid
           FROM charges c ${PAID_JOIN}
          ${where.sql} ${dateParts.join(" ")}
          GROUP BY c.id
       )
        ${balance} ${became}
        ORDER BY ${sortCol} ${dir}, id ${dir}
        LIMIT ? OFFSET ?`,
      params,
    );
    const page = this.withPaid(rows);
    const hydrated = await this.hydrate(page.map((o) => o.charge));
    return hydrated.map((charge, i) => ({
      charge,
      paid: page[i].paid,
      downPaid: Number(rows[i].__down_paid ?? 0),
    }));
  }

  private withPaid(rows: Record<string, unknown>[]): DbChargeWithPaid[] {
    const paid = rows.map((r) => Number(r.__paid ?? 0));
    return this.decodeAll<DbCharge>("charges", rows).map((charge, i) => ({
      charge,
      paid: paid[i],
    }));
  }

  async balances(chargeIds: string[]): Promise<DbChargeBalance[]> {
    if (chargeIds.length === 0) return [];
    const ph = chargeIds.map(() => "?").join(",");
    const rows = await this.all<{
      id: string;
      tenant_id: string;
      amount: string | number;
      paid: string | number | null;
    }>(
      `SELECT c.id, c.tenant_id, c.amount,
              (SELECT COALESCE(SUM(CAST(i.amount AS REAL)), 0)
                 FROM collection_items i
                 JOIN collections co ON co.id = i.collection_id
                WHERE i.charge_id = c.id AND co.voided_at IS NULL) AS paid
         FROM charges c
        WHERE c.id IN (${ph}) AND c.voided_at IS NULL`,
      chargeIds,
    );
    return rows.map((r) => {
      const amount = Number(r.amount);
      const paid = Number(r.paid ?? 0);
      return {
        id: r.id,
        tenant_id: r.tenant_id,
        amount,
        paid,
        balance: amount - paid,
      };
    });
  }

  async create(payload: CreateChargePayload): Promise<DbCharge> {
    const now = nowIso();
    const row: DbCharge = {
      ...payload,
      created_at: now,
      updated_at: now,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      written_off_at: null,
      written_off_by: null,
      write_off_reason: null,
    };
    await this.write(async (db) => {
      await insertDirty(db, "charges", row);
      await this.auditIn(db, {
        table: "charges",
        recordId: row.id,
        action: "create",
        after: row,
        ...(row.customer_id
          ? await this.customerAudit(row.customer_id)
          : { branchId: row.branch_id }),
      });
    });
    return row;
  }

  async update(id: string, values: UpdateChargePayload): Promise<DbCharge> {
    return this.patch(id, values, "update");
  }

  async void(
    id: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCharge> {
    return this.patch(
      id,
      { voided_at: nowIso(), voided_by: voidedBy, void_reason: reason },
      "void",
    );
  }

  async writeOff(
    id: string,
    writtenOffBy: string,
    reason: string | null,
  ): Promise<DbCharge> {
    return this.patch(
      id,
      {
        written_off_at: nowIso(),
        written_off_by: writtenOffBy,
        write_off_reason: reason,
      },
      "update",
    );
  }

  async writeOffMany(
    ids: string[],
    writtenOffBy: string,
    reason: string | null,
  ): Promise<DbCharge[]> {
    if (ids.length === 0) return [];
    const now = nowIso();
    const holes = ids.map(() => "?").join(",");
    const raw = await this.all<Record<string, unknown>>(
      `SELECT c.*, cu.name AS __subject FROM charges c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id IN (${holes})`,
      ids,
    );
    const subjects = new Map(
      raw.map((r) => [r.id as string, (r.__subject as string | null) ?? null]),
    );
    const priors = this.decodeAll<DbCharge>("charges", raw);
    const live = priors.filter((p) => !p.voided_at && !p.written_off_at);
    if (live.length === 0) return [];
    const changes = {
      written_off_at: now,
      written_off_by: writtenOffBy,
      write_off_reason: reason,
      updated_at: now,
    };
    await this.write(async (db) => {
      for (const prior of live) {
        await updateDirty(db, "charges", prior.id, changes);
        await this.auditIn(db, {
          table: "charges",
          recordId: prior.id,
          action: "update",
          before: prior,
          after: { ...prior, ...changes } as DbCharge,
          customerId: prior.customer_id ?? undefined,
          branchId: prior.branch_id,
          subject: subjects.get(prior.id) ?? null,
        });
      }
    });
    return live.map((p) => ({ ...p, ...changes }) as DbCharge);
  }

  async revertWriteOff(id: string): Promise<DbCharge> {
    return this.patch(id, { ...writeOffRevertPatch() }, "update");
  }

  private async patch(
    id: string,
    values: Record<string, unknown>,
    action: "void" | "update",
  ): Promise<DbCharge> {
    const prior = await this.forAudit(id);
    if (!prior) this.handleError(new Error("Charge not found"));
    const changes = { ...values, updated_at: nowIso() };
    const after = { ...prior.row, ...changes } as DbCharge;
    await this.write(async (db) => {
      await updateDirty(db, "charges", id, changes);
      await this.auditIn(db, {
        table: "charges",
        recordId: id,
        action,
        before: prior.row,
        after,
        customerId: prior.row.customer_id ?? undefined,
        branchId: prior.row.branch_id,
        subject: prior.subject,
      });
    });
    return after;
  }

  private async forAudit(
    id: string,
  ): Promise<{ row: DbCharge; subject: string | null } | null> {
    const raw = await this.first<Record<string, unknown>>(
      `SELECT c.*, cu.name AS __subject FROM charges c
         LEFT JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id = ?`,
      [id],
    );
    const row = this.decodeOne<DbCharge>("charges", raw);
    return row
      ? { row, subject: (raw?.__subject as string | null) ?? null }
      : null;
  }

  async writtenOffInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<DbCharge[]> {
    const parts = [
      { clause: "c.written_off_at IS NOT NULL", params: [] as unknown[] },
      { clause: "c.written_off_at >= ?", params: [startIso] },
      { clause: "c.written_off_at < ?", params: [endExclusiveIso] },
      this.branchWhere(branchFilter, this.BRANCH_SCOPES.charges, "c"),
    ];
    const where = this.combineWhere(parts);
    const rows = await this.all(
      `SELECT c.* FROM charges c ${where.sql}`,
      where.params,
    );
    return this.hydrate(this.decodeAll<DbCharge>("charges", rows));
  }
}
