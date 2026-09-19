import type { DbCustomerRequest } from "@/src/core/types/db";
import { isOnline } from "@/src/core/offline/net/connectivity";
import { RequiresConnectionError } from "@/src/core/offline/errors";
import type { QuotaPair } from "../utils/types";
import type {
  CustomerRequestInput,
  ICustomerRequestRepository,
} from "./ICustomerRequestRepository";
import { CustomerRequestRepository } from "./CustomerRequestRepository";

/**
 * Online-only: customer_requests is not mirrored, because "one pending row per
 * tenant" is a server rule the client cannot evaluate — see docs/offline.md.
 */
export class OfflineCustomerRequestRepository implements ICustomerRequestRepository {
  private online = new CustomerRequestRepository();

  private async requireOnline(): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
  }

  async findLatest(tenantId: string): Promise<DbCustomerRequest | null> {
    await this.requireOnline();
    return this.online.findLatest(tenantId);
  }

  async create(payload: CustomerRequestInput): Promise<DbCustomerRequest> {
    await this.requireOnline();
    return this.online.create(payload);
  }

  async updateCounts(id: string, extra: QuotaPair): Promise<DbCustomerRequest> {
    await this.requireOnline();
    return this.online.updateCounts(id, extra);
  }

  async cancel(id: string): Promise<DbCustomerRequest> {
    await this.requireOnline();
    return this.online.cancel(id);
  }
}
