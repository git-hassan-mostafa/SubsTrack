import { Platform } from "react-native";
import { BaseRepository } from "@/src/core/utils/BaseRepository";
import type { DbCustomerRequest } from "@/src/core/types/db";
import type { QuotaPair } from "../utils/types";
import type {
  CustomerRequestInput,
  ICustomerRequestRepository,
} from "./ICustomerRequestRepository";
import { OfflineCustomerRequestRepository } from "./CustomerRequestRepository.offline";

export class CustomerRequestRepository
  extends BaseRepository
  implements ICustomerRequestRepository
{
  // Newest row, pending or not — a decided one is what tells the admin the
  // owner answered.
  async findLatest(tenantId: string): Promise<DbCustomerRequest | null> {
    const { data, error } = await this.db
      .from("customer_requests")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbCustomerRequest) ?? null;
  }

  async create(payload: CustomerRequestInput): Promise<DbCustomerRequest> {
    const { data, error } = await this.db
      .from("customer_requests")
      .insert(payload)
      .select("*")
      .single();
    if (error) this.handleError(error);
    const created = data as DbCustomerRequest;
    this.audit({
      table: "customer_requests",
      recordId: created.id,
      action: "create",
      after: created,
    });
    return created;
  }

  async updateCounts(id: string, extra: QuotaPair): Promise<DbCustomerRequest> {
    return this.auditedUpdate<DbCustomerRequest>(
      "customer_requests",
      id,
      { requested_count: extra.customers, requested_plans: extra.plans },
      { branchColumn: null },
    );
  }

  async cancel(id: string): Promise<DbCustomerRequest> {
    return this.auditedUpdate<DbCustomerRequest>(
      "customer_requests",
      id,
      { status: "cancelled" },
      { action: "void", branchColumn: null },
    );
  }
}

const impl: ICustomerRequestRepository =
  Platform.OS === "web"
    ? new CustomerRequestRepository()
    : new OfflineCustomerRequestRepository();

export default impl;
