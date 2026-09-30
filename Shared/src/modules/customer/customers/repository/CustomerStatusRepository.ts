import { BaseRepository } from "@shared/core/utils/BaseRepository";
import type { ICustomerStatusRepository } from "@shared/modules/customer/customers/repository/ICustomerStatusRepository";
import type {
  CustomerStatusRequest,
  CustomerStatusResponse,
} from "@shared/modules/customer/customers/utils/types";

export class CustomerStatusRepository
  extends BaseRepository
  implements ICustomerStatusRepository
{
  async findPage(
    request: CustomerStatusRequest,
  ): Promise<CustomerStatusResponse> {
    await this.ensureFreshSession();
    const { data, error } =
      await this.db.functions.invoke<CustomerStatusResponse>(
        "customer-status",
        { body: request },
      );
    if (error) await this.handleFunctionsError(error);
    return data as CustomerStatusResponse;
  }
}
