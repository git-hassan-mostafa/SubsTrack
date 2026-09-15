import billingService from '@/src/modules/admin/billing/services/BillingService';
import { CustomerLimitError } from '@/src/modules/admin/billing/utils/customerLimitError';
import { AllowanceFloorError } from '@/src/modules/admin/billing/utils/allowanceFloorError';
import { signedText } from '@/src/modules/admin/billing/utils/allowanceChange';
import { MIN_CUSTOMER_ALLOWANCE } from '@/src/modules/admin/billing/utils/types';

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

// TC-CD-* — lowering the allowance. An admin does this without the owner, so
// two floors guard it: the 30-customer product minimum, and the customers
// already active. The HIGHER of the two is what actually binds.
describe('billing: lowering the allowance', () => {
  it('TC-CD-01 allows a cut down to exactly the active count', () => {
    expect(() => billingService.validateDecrease(40, 60, 40)).not.toThrow();
  });

  it('TC-CD-02 refuses one below the active count', () => {
    try {
      billingService.validateDecrease(39, 60, 40);
      throw new Error('expected AllowanceFloorError');
    } catch (e) {
      expect(e).toBeInstanceOf(AllowanceFloorError);
      expect((e as AllowanceFloorError).requested).toBe(39);
      expect((e as AllowanceFloorError).activeCount).toBe(40);
    }
  });

  it('TC-CD-03 refuses a raise through the lowering door', () => {
    expect(() => billingService.validateDecrease(70, 60, 40)).toThrow();
    expect(() => billingService.validateDecrease(60, 60, 40)).toThrow();
  });

  it('TC-CD-04 refuses a fraction or a negative limit', () => {
    expect(() => billingService.validateDecrease(40.5, 60, 40)).toThrow();
    expect(() => billingService.validateDecrease(-1, 60, 0)).toThrow();
  });

  it('TC-CD-05 refuses to go under the 30-customer floor, even at 0 active', () => {
    expect(() => billingService.validateDecrease(29, 60, 0)).toThrow();
    expect(() => billingService.validateDecrease(0, 60, 0)).toThrow();
  });

  it('TC-CD-05b allows a cut to exactly the floor', () => {
    expect(() =>
      billingService.validateDecrease(MIN_CUSTOMER_ALLOWANCE, 60, 0),
    ).not.toThrow();
  });

  it('TC-CD-05c the ACTIVE count outranks the floor when it is higher', () => {
    // 30 clears the floor, but 45 customers are already active.
    expect(() => billingService.validateDecrease(30, 60, 45)).toThrow(
      AllowanceFloorError,
    );
  });

  it('TC-CD-06 the floor outranks the raise check when both are wrong', () => {
    // 50 is below 60 so the raise check passes; the floor is what must bite.
    expect(() => billingService.validateDecrease(50, 60, 55)).toThrow(
      AllowanceFloorError,
    );
  });

  it('TC-CD-07 a tenant already over cap can still cut to its active count', () => {
    expect(() => billingService.validateDecrease(35, 40, 35)).not.toThrow();
  });

  it('TC-CD-08 the floor is a constant, not a literal, in both directions', () => {
    expect(MIN_CUSTOMER_ALLOWANCE).toBe(30);
    expect(() =>
      billingService.validateDecrease(MIN_CUSTOMER_ALLOWANCE - 1, 60, 0),
    ).toThrow();
  });
});

// TC-CS-* — the signed change field next to the new-total field. The two
// mirror one number, so the sign is the only thing telling a raise from a cut.
describe('billing: the change field', () => {
  it('TC-CS-01 shows a raise with an explicit plus', () => {
    expect(signedText(20)).toBe('+20');
  });

  it('TC-CS-02 shows a cut with its minus', () => {
    expect(signedText(-20)).toBe('-20');
  });

  it('TC-CS-03 shows nothing at all when nothing changed', () => {
    expect(signedText(0)).toBe('');
  });
});
