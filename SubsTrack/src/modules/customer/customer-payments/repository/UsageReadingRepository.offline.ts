import i18n from "@shared/core/i18n";
import type { DbUsageReading } from "@shared/core/types/db";
import { OfflineBaseRepository } from "@/src/core/offline/OfflineBaseRepository";
import { updateDirty, upsertNaturalKeyDirty } from "@/src/core/offline/db/dml";
import { deterministicId, nowIso } from "@shared/core/utils/ids";
import type {
  IUsageReadingRepository,
  UsageReadingPayload,
} from "@shared/modules/customer/customer-payments/repository/IUsageReadingRepository";

// Id hashed from (line, month) with a 'usage' prefix, so two phones make ONE row.
export class OfflineUsageReadingRepository
  extends OfflineBaseRepository
  implements IUsageReadingRepository
{
  async findForLines(customerPlanIds: string[]): Promise<DbUsageReading[]> {
    if (customerPlanIds.length === 0) return [];
    const rows = await this.all(
      `SELECT * FROM usage_readings WHERE voided_at IS NULL AND customer_plan_id IN (${customerPlanIds.map(() => "?").join(", ")})`,
      customerPlanIds,
    );
    return this.decodeAll<DbUsageReading>("usage_readings", rows);
  }

  async save(payload: UsageReadingPayload): Promise<DbUsageReading> {
    const now = nowIso();
    const row: DbUsageReading = {
      ...payload,
      id: await deterministicId(
        "usage",
        payload.customer_plan_id,
        payload.billing_month,
      ),
      voided_at: null,
      voided_by: null,
      created_at: now,
      updated_at: now,
    };
    const owner = await this.customerAudit(payload.customer_id);
    return this.write(async (db) => {
      const before = this.decodeOne<DbUsageReading>(
        "usage_readings",
        await this.first(
          "SELECT * FROM usage_readings WHERE customer_plan_id = ? AND billing_month = ?",
          [payload.customer_plan_id, payload.billing_month],
        ),
      );
      const storedId = await upsertNaturalKeyDirty(db, "usage_readings", row);
      const saved: DbUsageReading = {
        ...row,
        id: storedId,
        created_at: before?.created_at ?? row.created_at,
      };
      await this.auditIn(db, {
        table: "usage_readings",
        recordId: storedId,
        action: !before ? "create" : before.voided_at ? "restore" : "update",
        before,
        after: saved,
        ...owner,
      });
      return saved;
    });
  }

  async remove(id: string, voidedBy: string): Promise<DbUsageReading> {
    return this.write(async (db) => {
      const before = this.decodeOne<DbUsageReading>(
        "usage_readings",
        await this.first(
          "SELECT * FROM usage_readings WHERE id = ? AND voided_at IS NULL",
          [id],
        ),
      );
      if (!before) throw new Error(i18n.t("errors.usage_reading_not_found"));
      const now = nowIso();
      await updateDirty(db, "usage_readings", id, {
        voided_at: now,
        voided_by: voidedBy,
        updated_at: now,
      });
      const removed: DbUsageReading = {
        ...before,
        voided_at: now,
        voided_by: voidedBy,
        updated_at: now,
      };
      await this.auditIn(db, {
        table: "usage_readings",
        recordId: id,
        action: "void",
        before,
        after: removed,
        ...(await this.customerAudit(before.customer_id)),
      });
      return removed;
    });
  }
}
