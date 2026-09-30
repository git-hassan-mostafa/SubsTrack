import { RequiresConnectionError } from "@shared/core/errors/offlineErrors";
import { isOnline } from "@/src/core/offline/net/connectivity";
import { CustomerStatusRepository } from "@shared/modules/customer/customers/repository/CustomerStatusRepository";
import type { ICustomerStatusRepository } from "@shared/modules/customer/customers/repository/ICustomerStatusRepository";
import type {
  CustomerStatusRequest,
  CustomerStatusResponse,
} from "@shared/modules/customer/customers/utils/types";

// Online-only: the status page is computed by an edge function, never mirrored.
export class OfflineCustomerStatusRepository
  implements ICustomerStatusRepository
{
  private online = new CustomerStatusRepository();

  async findPage(
    request: CustomerStatusRequest,
  ): Promise<CustomerStatusResponse> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.findPage(request);
  }
}
