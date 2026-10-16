import i18n from "@shared/core/i18n";
import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { DbUsageReading } from "@shared/core/types/db";
import { nowIso } from "@shared/core/utils/ids";
import type {
  IUsageReadingRepository,
  UsageReadingPayload,
} from "@shared/modules/customer/customer-payments/repository/IUsageReadingRepository";

export class UsageReadingRepository
  extends BaseRepository
  implements IUsageReadingRepository
{
  async findForLines(customerPlanIds: string[]): Promise<DbUsageReading[]> {
    if (customerPlanIds.length === 0) return [];
    return this.readEveryRow<DbUsageReading>((from, to) =>
      this.db
        .from("usage_readings")
        .select("*", { count: "exact" })
        .in("customer_plan_id", customerPlanIds)
        .is("voided_at", null)
        .order("id")
        .range(from, to),
    );
  }

  async save(payload: UsageReadingPayload): Promise<DbUsageReading> {
    const { data: prior, error: readError } = await this.db
      .from("usage_readings")
      .select("*")
      .eq("customer_plan_id", payload.customer_plan_id)
      .eq("billing_month", payload.billing_month)
      .maybeSingle();
    if (readError) this.handleError(readError);
    const { data, error } = await this.db
      .from("usage_readings")
      .upsert(
        { ...payload, voided_at: null, voided_by: null },
        { onConflict: "customer_plan_id,billing_month" },
      )
      .select()
      .single();
    if (error) this.handleError(error);
    const saved = data as DbUsageReading;
    const before = prior as DbUsageReading | null;
    this.audit({
      table: "usage_readings",
      recordId: saved.id,
      action: !before ? "create" : before.voided_at ? "restore" : "update",
      before,
      after: saved,
      customerId: saved.customer_id,
    });
    return saved;
  }

  async remove(id: string, voidedBy: string): Promise<DbUsageReading> {
    const { data, error } = await this.db
      .from("usage_readings")
      .update({ voided_at: nowIso(), voided_by: voidedBy })
      .eq("id", id)
      .is("voided_at", null)
      .select()
      .maybeSingle();
    if (error) this.handleError(error);
    if (!data) throw new Error(i18n.t("errors.usage_reading_not_found"));
    const removed = data as DbUsageReading;
    this.audit({
      table: "usage_readings",
      recordId: removed.id,
      action: "void",
      before: { ...removed, voided_at: null, voided_by: null },
      after: removed,
      customerId: removed.customer_id,
    });
    return removed;
  }
}
