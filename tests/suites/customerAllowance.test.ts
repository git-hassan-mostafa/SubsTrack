import billingService from '@/src/modules/admin/billing/services/BillingService';
import { CustomerLimitError } from '@/src/modules/admin/billing/utils/customerLimitError';

// TC-CA-* — what the tenant is billed and whether they may add a customer.
// monthlyAmountUsd is an invoice figure shown to the admin, and
// assertCanCreateCustomer is the only quantity limit left in the product.

describe('billing: monthly amount', () => {
  it('TC-CA-01 charges price per active customer', () => {
    expect(billingService.monthlyAmountUsd(100, 0.15)).toBe(15);
  });

  it('TC-CA-02 rounds to cents instead of leaking float noise', () => {
    // 7 * 0.15 is 1.0499999999999998 in raw float.
    expect(billingService.monthlyAmountUsd(7, 0.15)).toBe(1.05);
    expect(billingService.monthlyAmountUsd(3, 0.3333)).toBe(1);
  });

  it('TC-CA-03 a tenant with no customers owes nothing', () => {
    expect(billingService.monthlyAmountUsd(0, 0.15)).toBe(0);
  });

  it('TC-CA-04 a free tenant owes nothing however many customers', () => {
    expect(billingService.monthlyAmountUsd(500, 0)).toBe(0);
  });
});

describe('billing: the customer cap', () => {
  it('TC-CA-05 allows a create below the allowance', () => {
    expect(() => billingService.assertCanCreateCustomer(30, 29)).not.toThrow();
  });

  it('TC-CA-06 blocks AT the allowance, not one past it', () => {
    try {
      billingService.assertCanCreateCustomer(30, 30);
      throw new Error('expected CustomerLimitError');
    } catch (e) {
      expect(e).toBeInstanceOf(CustomerLimitError);
      expect((e as CustomerLimitError).allowance).toBe(30);
      expect((e as CustomerLimitError).activeCount).toBe(30);
    }
  });

  it('TC-CA-07 blocks a tenant already over cap after the owner cut it', () => {
    expect(() => billingService.assertCanCreateCustomer(30, 31)).toThrow(
      CustomerLimitError,
    );
  });

  it('TC-CA-08 a zero allowance blocks everything', () => {
    expect(() => billingService.assertCanCreateCustomer(0, 0)).toThrow(
      CustomerLimitError,
    );
  });
});

describe('billing: request validation', () => {
  it('TC-CA-09 refuses below the ten-customer minimum', () => {
    expect(() => billingService.validateRequest(9)).toThrow();
    expect(() => billingService.validateRequest(0)).toThrow();
    expect(() => billingService.validateRequest(-5)).toThrow();
  });

  it('TC-CA-10 accepts the minimum and above', () => {
    expect(() => billingService.validateRequest(10)).not.toThrow();
    expect(() => billingService.validateRequest(250)).not.toThrow();
  });

  it('TC-CA-11 refuses a fraction of a customer', () => {
    expect(() => billingService.validateRequest(10.5)).toThrow();
  });
});
