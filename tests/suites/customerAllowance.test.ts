import billingService from "@/src/modules/admin/billing/services/BillingService";
import { QuotaExceededError } from "@/src/modules/admin/billing/utils/quotaError";
import { AllowanceFloorError } from "@/src/modules/admin/billing/utils/allowanceFloorError";
import { signedText } from "@/src/modules/admin/billing/utils/allowanceChange";
import {
  MIN_CUSTOMER_ALLOWANCE,
  type QuotaPair,
} from "@/src/modules/admin/billing/utils/types";

// TC-CA-* — what the tenant is billed and whether they may add a customer or a
// service line. monthlyAmountUsd is an invoice figure shown to the admin, and
// assertQuotas is the ONLY quantity gate left in the product.

const pair = (customers: number, plans: number): QuotaPair => ({
  customers,
  plans,
});

describe("billing: monthly amount", () => {
  it("TC-CA-01 charges price per ALLOWED service line, not per customer", () => {
    expect(billingService.monthlyAmountUsd(100, 0.15)).toBe(15);
  });

  it("TC-CA-02 rounds to cents instead of leaking float noise", () => {
    // 7 * 0.15 is 1.0499999999999998 in raw float.
    expect(billingService.monthlyAmountUsd(7, 0.15)).toBe(1.05);
    expect(billingService.monthlyAmountUsd(3, 0.3333)).toBe(1);
  });

  it("TC-CA-03 a tenant allowed no service lines owes nothing", () => {
    expect(billingService.monthlyAmountUsd(0, 0.15)).toBe(0);
  });

  it("TC-CA-04 a free tenant owes nothing however many lines", () => {
    expect(billingService.monthlyAmountUsd(500, 0)).toBe(0);
  });

  it("TC-CA-04b bills the ALLOWANCE, so using fewer lines costs the same", () => {
    const allowance = 80;
    const active = 50;
    expect(billingService.monthlyAmountUsd(allowance, 0.15)).toBe(12);
    expect(billingService.monthlyAmountUsd(allowance, 0.15)).not.toBe(
      billingService.monthlyAmountUsd(active, 0.15),
    );
  });
});

describe("billing: the customer cap", () => {
  it("TC-CA-05 allows a create below the allowance", () => {
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(29, 40), pair(30, 40)),
    ).not.toThrow();
  });

  it("TC-CA-06 blocks AT the allowance, not one past it", () => {
    try {
      billingService.assertQuotas(pair(30, 60), pair(30, 40), pair(31, 40));
      throw new Error("expected QuotaExceededError");
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaExceededError);
      expect((e as QuotaExceededError).kind).toBe("customers");
      expect((e as QuotaExceededError).limit).toBe(30);
      expect((e as QuotaExceededError).activeCount).toBe(30);
    }
  });

  it("TC-CA-07 blocks a tenant already over cap after the owner cut it", () => {
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(31, 40), pair(32, 40)),
    ).toThrow(QuotaExceededError);
  });

  it("TC-CA-08 a zero allowance blocks everything", () => {
    expect(() =>
      billingService.assertQuotas(pair(0, 0), pair(0, 0), pair(1, 0)),
    ).toThrow(QuotaExceededError);
  });
});

// TC-CQ-* — the SECOND cap, on service lines. A customer may hold many lines,
// so this is the limit the bill is actually counted on.
describe("billing: the service-line cap", () => {
  it("TC-CQ-01 allows a batch of lines that fits", () => {
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(20, 57), pair(20, 60)),
    ).not.toThrow();
  });

  it("TC-CQ-02 blocks the batch that would cross the limit", () => {
    try {
      billingService.assertQuotas(pair(30, 60), pair(20, 58), pair(20, 61));
      throw new Error("expected QuotaExceededError");
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaExceededError);
      expect((e as QuotaExceededError).kind).toBe("plans");
      expect((e as QuotaExceededError).limit).toBe(60);
      expect((e as QuotaExceededError).activeCount).toBe(58);
    }
  });

  it("TC-CQ-03 a quota the write does not GROW can never refuse it", () => {
    // 70 lines against a limit of 60 — already over, and removing one must work.
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(20, 70), pair(20, 69)),
    ).not.toThrow();
    // Untouched is not grown either.
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(20, 70), pair(20, 70)),
    ).not.toThrow();
  });

  it("TC-CQ-04 a customer and its drafted lines are BOTH counted up front", () => {
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(25, 59), pair(26, 62)),
    ).toThrow(QuotaExceededError);
  });

  it("TC-CQ-05 the customer cap is reported first when both breach", () => {
    try {
      billingService.assertQuotas(pair(30, 60), pair(30, 60), pair(31, 63));
      throw new Error("expected QuotaExceededError");
    } catch (e) {
      expect((e as QuotaExceededError).kind).toBe("customers");
    }
  });

  it("TC-CQ-06 removing lines while adding one nets out inside the limit", () => {
    // Three lines removed, two added: 60 - 3 + 2 = 59.
    expect(() =>
      billingService.assertQuotas(pair(30, 60), pair(20, 60), pair(20, 59)),
    ).not.toThrow();
  });
});

describe("billing: request validation", () => {
  it("TC-CA-09 refuses below the ten-slot minimum across BOTH limits", () => {
    expect(() => billingService.validateRequest(pair(9, 0))).toThrow();
    expect(() => billingService.validateRequest(pair(0, 9))).toThrow();
    expect(() => billingService.validateRequest(pair(4, 5))).toThrow();
    expect(() => billingService.validateRequest(pair(0, 0))).toThrow();
  });

  it("TC-CA-10 accepts the minimum and above, from either side or split", () => {
    expect(() => billingService.validateRequest(pair(10, 0))).not.toThrow();
    expect(() => billingService.validateRequest(pair(0, 10))).not.toThrow();
    expect(() => billingService.validateRequest(pair(5, 5))).not.toThrow();
    expect(() => billingService.validateRequest(pair(250, 250))).not.toThrow();
  });

  it("TC-CA-11 refuses a fraction or a negative ask", () => {
    expect(() => billingService.validateRequest(pair(10.5, 0))).toThrow();
    expect(() => billingService.validateRequest(pair(0, 10.5))).toThrow();
    expect(() => billingService.validateRequest(pair(20, -5))).toThrow();
  });
});

// TC-CD-* — lowering the limits. An admin does this without the owner, so three
// floors guard it: the 30-customer product minimum, what is already active, and
// the rule that service lines can never sit below customers.
describe("billing: lowering the limits", () => {
  it("TC-CD-01 allows a cut down to exactly the active counts", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(40, 80),
        pair(60, 100),
        pair(40, 80),
      ),
    ).not.toThrow();
  });

  it("TC-CD-02 refuses one below the active customer count", () => {
    try {
      billingService.validateDecrease(
        pair(39, 80),
        pair(60, 100),
        pair(40, 70),
      );
      throw new Error("expected AllowanceFloorError");
    } catch (e) {
      expect(e).toBeInstanceOf(AllowanceFloorError);
      expect((e as AllowanceFloorError).kind).toBe("customers");
      expect((e as AllowanceFloorError).requested).toBe(39);
      expect((e as AllowanceFloorError).activeCount).toBe(40);
    }
  });

  it("TC-CD-02b refuses one below the active service-line count", () => {
    try {
      billingService.validateDecrease(
        pair(40, 69),
        pair(60, 100),
        pair(40, 70),
      );
      throw new Error("expected AllowanceFloorError");
    } catch (e) {
      expect(e).toBeInstanceOf(AllowanceFloorError);
      expect((e as AllowanceFloorError).kind).toBe("plans");
      expect((e as AllowanceFloorError).requested).toBe(69);
      expect((e as AllowanceFloorError).activeCount).toBe(70);
    }
  });

  it("TC-CD-02c refuses service lines below customers, whatever is active", () => {
    expect(() =>
      billingService.validateDecrease(pair(50, 49), pair(60, 100), pair(0, 0)),
    ).toThrow();
  });

  it("TC-CD-03 refuses a raise through the lowering door", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(70, 100),
        pair(60, 100),
        pair(40, 70),
      ),
    ).toThrow();
    expect(() =>
      billingService.validateDecrease(
        pair(60, 110),
        pair(60, 100),
        pair(40, 70),
      ),
    ).toThrow();
  });

  it("TC-CD-03b refuses a save that moves neither limit", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(60, 100),
        pair(60, 100),
        pair(40, 70),
      ),
    ).toThrow();
  });

  it("TC-CD-03c lowering ONE limit alone is a real change", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(60, 90),
        pair(60, 100),
        pair(40, 70),
      ),
    ).not.toThrow();
  });

  it("TC-CD-04 refuses a fraction or a negative limit", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(40.5, 80),
        pair(60, 100),
        pair(40, 70),
      ),
    ).toThrow();
    expect(() =>
      billingService.validateDecrease(pair(-1, 80), pair(60, 100), pair(0, 0)),
    ).toThrow();
  });

  it("TC-CD-05 refuses to go under the 30-customer floor, even at 0 active", () => {
    expect(() =>
      billingService.validateDecrease(pair(29, 80), pair(60, 100), pair(0, 0)),
    ).toThrow();
    expect(() =>
      billingService.validateDecrease(pair(0, 80), pair(60, 100), pair(0, 0)),
    ).toThrow();
  });

  it("TC-CD-05b allows a cut to exactly the floor", () => {
    expect(() =>
      billingService.validateDecrease(
        pair(MIN_CUSTOMER_ALLOWANCE, 80),
        pair(60, 100),
        pair(0, 0),
      ),
    ).not.toThrow();
  });

  it("TC-CD-05c the ACTIVE count outranks the floor when it is higher", () => {
    // 30 clears the floor, but 45 customers are already active.
    expect(() =>
      billingService.validateDecrease(
        pair(30, 80),
        pair(60, 100),
        pair(45, 70),
      ),
    ).toThrow(AllowanceFloorError);
  });

  it("TC-CD-06 the floor outranks the raise check when both are wrong", () => {
    // 50 is below 60 so the raise check passes; the floor is what must bite.
    expect(() =>
      billingService.validateDecrease(
        pair(50, 90),
        pair(60, 100),
        pair(55, 70),
      ),
    ).toThrow(AllowanceFloorError);
  });

  it("TC-CD-07 a tenant already over cap can still cut to its active counts", () => {
    expect(() =>
      billingService.validateDecrease(pair(35, 70), pair(40, 80), pair(35, 70)),
    ).not.toThrow();
  });

  it("TC-CD-08 the floor is a constant, not a literal, in both directions", () => {
    expect(MIN_CUSTOMER_ALLOWANCE).toBe(30);
    expect(() =>
      billingService.validateDecrease(
        pair(MIN_CUSTOMER_ALLOWANCE - 1, 80),
        pair(60, 100),
        pair(0, 0),
      ),
    ).toThrow();
  });
});

// TC-CS-* — the signed change field next to each new-total field. The two
// mirror one number, so the sign is the only thing telling a raise from a cut.
describe("billing: the change field", () => {
  it("TC-CS-01 shows a raise with an explicit plus", () => {
    expect(signedText(20)).toBe("+20");
  });

  it("TC-CS-02 shows a cut with its minus", () => {
    expect(signedText(-20)).toBe("-20");
  });

  it("TC-CS-03 shows nothing at all when nothing changed", () => {
    expect(signedText(0)).toBe("");
  });
});
