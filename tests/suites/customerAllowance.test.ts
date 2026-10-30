import billingService from "@shared/modules/admin/billing/services/BillingService";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import { AllowanceFloorError } from "@shared/modules/admin/billing/utils/allowanceFloorError";
import { signedText } from "@shared/modules/admin/billing/utils/allowanceChange";
import {
  FREE_PLAN_LINES,
  MAX_SELF_SERVE_PLANS,
  MIN_CUSTOMER_ALLOWANCE,
  type QuotaPair,
  type TenantPricing,
} from "@shared/modules/admin/billing/utils/types";
import {
  currentPackageSize,
  parsePackagePrice,
  pricePackages,
} from "@shared/modules/admin/billing/utils/packages";
import { monthlyAmountUsdOf } from "@shared/modules/admin/billing/utils/monthlyAmount";
import type { AppOption } from "@shared/core/types";
import { formatMoney } from "@shared/core/utils/currency";
import {
  initialDraft,
  monthlyBillText,
  packageChoices,
} from "../../SuperAdminWeb/src/modules/tenants/services/tenantForm.js";

// TC-CA-* — what the tenant is billed and whether they may add a customer or a
// service line. monthlyAmountUsd is an invoice figure shown to the admin, and
// assertQuotas is the ONLY quantity gate left in the product.

const pair = (customers: number, plans: number): QuotaPair => ({
  customers,
  plans,
});

const perLine = (planAllowance: number, pricePerPlanUsd: number): TenantPricing => ({
  pricingModel: "per_line",
  planAllowance,
  pricePerPlanUsd,
  fixedPriceUsd: null,
});

const fixed = (
  pricingModel: "package" | "unlimited",
  planAllowance: number,
  fixedPriceUsd: number | null,
): TenantPricing => ({ pricingModel, planAllowance, pricePerPlanUsd: 0.15, fixedPriceUsd });

describe("billing: monthly amount", () => {
  it("TC-CA-01 charges price per ALLOWED service line, not per customer", () => {
    expect(billingService.monthlyAmountUsd(perLine(100, 0.15))).toBe(15);
  });

  it("TC-CA-02 rounds 23 × 0.15 (3.4499999999999997 in raw float) to cents", () => {
    expect(billingService.monthlyAmountUsd(perLine(23, 0.15))).toBe(3.45);
    expect(billingService.monthlyAmountUsd(perLine(30, 0.3333))).toBe(10);
  });

  it("TC-CA-03 a tenant allowed no service lines owes nothing", () => {
    expect(billingService.monthlyAmountUsd(perLine(0, 0.15))).toBe(0);
  });

  it("TC-CA-04 a free tenant owes nothing however many lines", () => {
    expect(billingService.monthlyAmountUsd(perLine(500, 0))).toBe(0);
  });

  it("TC-CA-04b bills the ALLOWANCE, so using fewer lines costs the same", () => {
    const allowance = 80;
    const active = 50;
    expect(billingService.monthlyAmountUsd(perLine(allowance, 0.15))).toBe(12);
    expect(billingService.monthlyAmountUsd(perLine(allowance, 0.15))).not.toBe(
      billingService.monthlyAmountUsd(perLine(active, 0.15)),
    );
  });

  it("TC-CA-04c up to 20 allowed lines is free; at 21 EVERY line is billed", () => {
    expect(FREE_PLAN_LINES).toBe(20);
    expect(billingService.monthlyAmountUsd(perLine(20, 0.15))).toBe(0);
    expect(billingService.isFreeTier(perLine(20, 0.15))).toBe(true);
    expect(billingService.monthlyAmountUsd(perLine(21, 0.15))).toBe(3.15);
    expect(billingService.isFreeTier(perLine(21, 0.15))).toBe(false);
  });

  it("TC-CA-04d a package bills its fixed price, whatever its limit or line price", () => {
    expect(billingService.monthlyAmountUsd(fixed("package", 300, 30))).toBe(30);
    expect(billingService.monthlyAmountUsd(fixed("package", 20, 30))).toBe(30);
    expect(billingService.isFreeTier(fixed("package", 20, 30))).toBe(false);
  });

  it("TC-CA-04e unlimited bills its fixed price, rounded; a missing price reads 0", () => {
    expect(billingService.monthlyAmountUsd(fixed("unlimited", 20, 75))).toBe(75);
    expect(billingService.monthlyAmountUsd(fixed("unlimited", 20, 29.999))).toBe(30);
    expect(billingService.monthlyAmountUsd(fixed("unlimited", 20, null))).toBe(0);
  });

  it("TC-CA-04f the owner page's bill rule gives the same amount as the tenant apps in every case", () => {
    const cases = [
      perLine(0, 0.15),
      perLine(20, 0.15),
      perLine(21, 0.15),
      perLine(23, 0.15),
      perLine(100, 0.15),
      perLine(80, 0.3333),
      fixed("package", 300, 30),
      fixed("package", 500, 49.99),
      fixed("unlimited", 20, 75),
      fixed("unlimited", 20, null),
    ];
    for (const pricing of cases) {
      expect(monthlyAmountUsdOf(pricing)).toBe(billingService.monthlyAmountUsd(pricing));
    }
  });
});

describe("billing: pricing models and the limits they set", () => {
  it("TC-CA-12 an unlimited plan never refuses a write, whatever it stores", () => {
    const limits = billingService.quotaLimitsOf({
      pricingModel: "unlimited",
      customerAllowance: 20,
      planAllowance: 20,
    });
    expect(() =>
      billingService.assertQuotas(limits, pair(5000, 9000), pair(5001, 9002)),
    ).not.toThrow();
  });

  it("TC-CA-13 a package keeps its limits: subscriber 301 is refused", () => {
    const limits = billingService.quotaLimitsOf({
      pricingModel: "package",
      customerAllowance: 300,
      planAllowance: 300,
    });
    expect(limits).toEqual(pair(300, 300));
    expect(() =>
      billingService.assertQuotas(limits, pair(300, 300), pair(301, 301)),
    ).toThrow(QuotaExceededError);
  });

  it("TC-CA-14 only a per-line plan changes its own limits in the app", () => {
    expect(billingService.changesLimitsInApp("per_line")).toBe(true);
    expect(billingService.changesLimitsInApp("package")).toBe(false);
    expect(billingService.changesLimitsInApp("unlimited")).toBe(false);
  });

  it("TC-CA-15 asking for more than 100 plans asks for a special price instead", () => {
    expect(MAX_SELF_SERVE_PLANS).toBe(100);
    expect(billingService.needsSpecialPrice(pair(100, 100))).toBe(false);
    expect(billingService.needsSpecialPrice(pair(90, 101))).toBe(true);
  });
});

const option = (key: string, value: string | null): AppOption => ({
  id: key,
  key,
  value,
  description: null,
  createdAt: "2026-10-29T00:00:00Z",
  updatedAt: "2026-10-29T00:00:00Z",
});

// TC-CA-16* — the three website packages, priced from app_options.
describe("billing: price packages", () => {
  it("TC-CA-16a a blank, bad, zero or negative price means no price yet", () => {
    expect(parsePackagePrice(null)).toBeNull();
    expect(parsePackagePrice("")).toBeNull();
    expect(parsePackagePrice("  ")).toBeNull();
    expect(parsePackagePrice("abc")).toBeNull();
    expect(parsePackagePrice("0")).toBeNull();
    expect(parsePackagePrice("-5")).toBeNull();
    expect(parsePackagePrice("30")).toBe(30);
    expect(parsePackagePrice("29.999")).toBe(30);
  });

  it("TC-CA-16b each package reads its own option, whatever the key case", () => {
    const options = [option("package300usd", "30"), option("Package1000Usd", "80")];
    expect(pricePackages(options)).toEqual([
      { size: 300, priceUsd: 30 },
      { size: 500, priceUsd: null },
      { size: 1000, priceUsd: 80 },
    ]);
  });

  it("TC-CA-16c only a package plan whose line limit is a package size is current", () => {
    expect(currentPackageSize({ pricingModel: "package", planAllowance: 500 })).toBe(500);
    expect(currentPackageSize({ pricingModel: "package", planAllowance: 400 })).toBeNull();
    expect(currentPackageSize({ pricingModel: "per_line", planAllowance: 300 })).toBeNull();
  });

  it("TC-CA-16d the owner page's package pick fills the same limits and price the apps show", () => {
    const options = [
      option("Package300Usd", "30"),
      option("Package500Usd", ""),
      option("Package1000Usd", "79.995"),
    ];
    const draft = { ...initialDraft(null), pricingModel: "package", allowance: "500", planAllowance: "500" };
    const choices = packageChoices(options, draft);
    expect(choices.map(({ fields, picked }) => ({ ...fields, picked }))).toEqual(
      pricePackages(options).map((pkg) => ({
        allowance: String(pkg.size),
        planAllowance: String(pkg.size),
        fixedPrice: pkg.priceUsd == null ? "" : String(pkg.priceUsd),
        picked: pkg.size === 500,
      })),
    );
    expect(choices[2].fields).toEqual({ allowance: "1000", planAllowance: "1000", fixedPrice: "80" });
    expect(monthlyBillText({ ...draft, ...choices[2].fields })).toBe(
      formatMoney(
        billingService.monthlyAmountUsd({
          pricingModel: "package",
          planAllowance: 1000,
          pricePerPlanUsd: 0.15,
          fixedPriceUsd: 80,
        }),
        null,
        null,
      ),
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
// floors guard it: the 20-customer product minimum, what is already active, and
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

  it("TC-CD-05 refuses to go under the 20-customer floor, even at 0 active", () => {
    expect(() =>
      billingService.validateDecrease(pair(19, 80), pair(60, 100), pair(0, 0)),
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
    expect(MIN_CUSTOMER_ALLOWANCE).toBe(20);
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
