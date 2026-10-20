import { RequiresConnectionError } from "@shared/core/errors/offlineErrors";
import { isOnline } from "@/src/core/offline/net/connectivity";
import { CustomerImportRepository } from "@shared/modules/customer/customer-import/repository/CustomerImportRepository";
import type {
  ICustomerImportRepository,
  ImportCustomerPayload,
  ImportLinePayload,
  PhoneOwner,
} from "@shared/modules/customer/customer-import/repository/ICustomerImportRepository";

// Online-only: the file import is a web feature and never writes the mirror.
export class OfflineCustomerImportRepository implements ICustomerImportRepository {
  private online = new CustomerImportRepository();

  async findPhoneOwners(): Promise<PhoneOwner[]> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.findPhoneOwners();
  }

  async importGroup(customers: ImportCustomerPayload[], lines: ImportLinePayload[]): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.importGroup(customers, lines);
  }

  async findExistingIds(ids: string[]): Promise<Set<string>> {
    if (!(await isOnline())) throw new RequiresConnectionError();
    return this.online.findExistingIds(ids);
  }
}
