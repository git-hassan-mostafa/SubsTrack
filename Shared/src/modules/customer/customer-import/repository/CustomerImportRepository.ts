import { buildAuditRow } from "@shared/core/audit/buildAuditRow";
import type { DbAuditLog } from "@shared/core/types/db";
import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type {
  ICustomerImportRepository,
  ImportCustomerPayload,
  ImportLinePayload,
  PhoneOwner,
} from "./ICustomerImportRepository";

type AuditPayload = Pick<
  DbAuditLog,
  | "id"
  | "branch_id"
  | "table_name"
  | "record_id"
  | "after_data"
  | "label"
  | "subject"
  | "subject_id"
  | "actor_username"
  | "occurred_at"
>;

function auditPayload(row: DbAuditLog | null): AuditPayload[] {
  if (!row) return [];
  return [
    {
      id: row.id,
      branch_id: row.branch_id,
      table_name: row.table_name,
      record_id: row.record_id,
      after_data: row.after_data,
      label: row.label,
      subject: row.subject,
      subject_id: row.subject_id,
      actor_username: row.actor_username,
      occurred_at: row.occurred_at,
    },
  ];
}

export class CustomerImportRepository extends BaseRepository implements ICustomerImportRepository {
  async findPhoneOwners(): Promise<PhoneOwner[]> {
    const rows = await this.readEveryRow<{ name: string; phone_number: string }>((from, to) =>
      this.db
        .from("customers")
        .select("name, phone_number", { count: "exact" })
        .not("phone_number", "is", null)
        .order("id")
        .range(from, to),
    );
    return rows.map((row) => ({ phoneNumber: row.phone_number, name: row.name }));
  }

  // The trail rides in the same call, so a group never lands without its history.
  async importGroup(customers: ImportCustomerPayload[], lines: ImportLinePayload[]): Promise<void> {
    const byId = new Map(customers.map((c) => [c.id, c]));
    const audit = [
      ...customers.flatMap((customer) =>
        auditPayload(
          buildAuditRow({
            table: "customers",
            recordId: customer.id,
            action: "import",
            after: customer,
            branchId: customer.branch_id,
          }),
        ),
      ),
      ...lines.flatMap((line) => {
        const owner = byId.get(line.customer_id);
        return auditPayload(
          buildAuditRow({
            table: "customer_plans",
            recordId: line.id,
            action: "import",
            after: line,
            branchId: owner?.branch_id ?? null,
            subject: owner?.name ?? null,
            customerId: line.customer_id,
          }),
        );
      }),
    ];
    const { error } = await this.db.rpc("import_customers", {
      p_customers: customers,
      p_lines: lines,
      p_audit: audit,
    });
    if (error) this.handleError(error);
  }

  async findExistingIds(ids: string[]): Promise<Set<string>> {
    return this.referencedIdsIn("customers", "id", ids);
  }
}
