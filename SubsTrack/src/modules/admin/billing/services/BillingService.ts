import i18n from '@/src/core/i18n';
import type { CustomerRequest } from '@/src/core/types';
import repository from '../repository/CustomerRequestRepository';
import { mapDbCustomerRequestToCustomerRequest } from '../utils/mapper';
import { CustomerLimitError } from '../utils/customerLimitError';
import { MIN_CUSTOMER_REQUEST } from '../utils/types';

class BillingService {
  // Always USD — never the tenant's display currency, see gotcha #143.
  monthlyAmountUsd(activeCustomers: number, pricePerCustomerUsd: number): number {
    return Math.round(activeCustomers * pricePerCustomerUsd * 100) / 100;
  }

  assertCanCreateCustomer(allowance: number, activeCount: number): void {
    if (activeCount >= allowance) {
      throw new CustomerLimitError(allowance, activeCount);
    }
  }

  validateRequest(extraCustomers: number): void {
    if (!Number.isInteger(extraCustomers) || extraCustomers < MIN_CUSTOMER_REQUEST) {
      throw new Error(
        i18n.t('billing.request_min_error', { min: MIN_CUSTOMER_REQUEST }),
      );
    }
  }

  async getLatestRequest(tenantId: string): Promise<CustomerRequest | null> {
    const row = await repository.findLatest(tenantId);
    return row ? mapDbCustomerRequestToCustomerRequest(row) : null;
  }

  async requestMore(
    tenantId: string,
    extraCustomers: number,
    requestedBy: string | null,
  ): Promise<CustomerRequest> {
    this.validateRequest(extraCustomers);
    const row = await repository.create({
      tenant_id: tenantId,
      requested_count: extraCustomers,
      requested_by: requestedBy,
    });
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async editRequest(id: string, extraCustomers: number): Promise<CustomerRequest> {
    this.validateRequest(extraCustomers);
    const row = await repository.updateCount(id, extraCustomers);
    return mapDbCustomerRequestToCustomerRequest(row);
  }

  async cancelRequest(id: string): Promise<CustomerRequest> {
    const row = await repository.cancel(id);
    return mapDbCustomerRequestToCustomerRequest(row);
  }
}

export default new BillingService();
