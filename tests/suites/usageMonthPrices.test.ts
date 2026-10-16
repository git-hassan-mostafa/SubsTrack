import type { PlanPriceChange, PlanUsage } from "@shared/core/types";
import {
  canSavePlan,
  planDraftOf,
  withBillingType,
  withPlanDuration,
  withPlanUsage,
} from "@shared/modules/admin/plans/utils/planForm";
import {
  canSaveUsagePrices,
  hasUsagePriceEdits,
  usageMonthPriceRows,
  usagePriceDraftState,
  usagePriceDraftsOf,
  usagePricesToSave,
} from "@shared/modules/admin/plans/utils/usageMonthPrices";
import { plan } from "../helpers/factories";

// TC-UMP-* — the plan form's billing type and the Month prices screen.

const METER: PlanUsage = {
  entry: "reading",
  unitName: "kWh",
  feeName: "Fixed fee",
  highUsagePercent: null,
};

const p10 = plan({ id: "p-10a", name: "10A", price: null, currencyId: "cur-lbp", usage: METER });
const p15 = plan({ id: "p-15a", name: "15A", price: null, currencyId: "cur-lbp", usage: METER });
const fixed = plan({ id: "p-net", price: 20 });

const price = (
  planId: string,
  fromMonth: string,
  unitPrice: number,
  fixedFee: number,
  createdAt: string,
): PlanPriceChange => ({
  id: `${planId}-${fromMonth}-${createdAt}`,
  planId,
  fromMonth,
  price: unitPrice,
  currencyId: "cur-lbp",
  durationMonths: 1,
  isCustomPrice: false,
  fixedFee,
  createdAt,
});

const changes = [
  price("p-10a", "2026-08-01", 40000, 600000, "2026-08-02T08:00:00.000Z"),
  price("p-10a", "2026-08-01", 42000, 650000, "2026-08-03T08:00:00.000Z"),
  price("p-10a", "2026-09-01", 45000, 685000, "2026-09-02T08:00:00.000Z"),
  price("p-15a", "2026-09-01", 45000, 985000, "2026-09-02T08:00:00.000Z"),
];

describe("plan form billing type", () => {
  it("TC-UMP-01 choosing usage makes a one-month plan with no custom price", () => {
    const draft = withBillingType(
      { ...withPlanDuration(planDraftOf(null, null), 3), isCustomPrice: true },
      "usage",
    );
    expect(draft.durationMonths).toBe(1);
    expect(draft.isCustomPrice).toBe(false);
    expect(draft.usage?.entry).toBe("reading");
    expect(withBillingType(draft, "fixed").usage).toBeNull();
  });

  it("TC-UMP-02 a usage plan saves only with a name, a unit name and a fee name", () => {
    const draft = { ...withBillingType(planDraftOf(null, null), "usage"), name: "10A" };
    expect(canSavePlan(draft)).toBe(false);
    expect(canSavePlan(withPlanUsage(draft, { unitName: "kWh" }))).toBe(false);
    expect(canSavePlan(withPlanUsage(draft, { unitName: "kWh", feeName: "Fee" }))).toBe(true);
  });
});

describe("month price list", () => {
  it("TC-UMP-03 one row per month, newest first, the latest save of a month wins", () => {
    const rows = usageMonthPriceRows(changes.filter((c) => c.planId === "p-10a"));
    expect(rows.map((r) => [r.month, r.price.unitPrice, r.price.fixedFee])).toEqual([
      ["2026-09-01", 45000, 685000],
      ["2026-08-01", 42000, 650000],
    ]);
  });

  it("TC-UMP-04 a row with no fixed fee (a fixed plan's price) is not a month price", () => {
    const fixedRow = { ...price("p-10a", "2026-07-01", 20, 0, "2026-07-01T08:00:00.000Z"), fixedFee: null };
    expect(usageMonthPriceRows([fixedRow])).toEqual([]);
  });
});

describe("Month prices screen", () => {
  it("TC-UMP-05 only usage plans are listed, each showing that month's saved price", () => {
    const drafts = usagePriceDraftsOf([p10, fixed, p15], changes, "2026-08-01", {});
    expect(drafts.map((d) => [d.plan.id, d.unitPrice, d.fixedFee])).toEqual([
      ["p-10a", 42000, 650000],
      ["p-15a", null, null],
    ]);
  });

  it("TC-UMP-06 a month with no price shows the last earlier month's price as a hint", () => {
    const [ten] = usagePriceDraftsOf([p10], changes, "2026-10-01", {});
    expect(ten.saved).toBeNull();
    expect(ten.unitPrice).toBeNull();
    expect(ten.last?.month).toBe("2026-09-01");
  });

  it("TC-UMP-07 only changed, complete prices are saved", () => {
    const drafts = usagePriceDraftsOf([p10, p15], changes, "2026-09-01", {
      "p-15a": { unitPrice: 46000 },
    });
    expect(usagePriceDraftState(drafts[0])).toBe("unchanged");
    expect(usagePricesToSave(drafts).map((p) => [p.plan.id, p.unitPrice, p.fixedFee])).toEqual([
      ["p-15a", 46000, 985000],
    ]);
    expect(canSaveUsagePrices(drafts)).toBe(true);
  });

  it("TC-UMP-08 half-typed, zero unit price, or a cleared saved price blocks the save", () => {
    const half = usagePriceDraftsOf([p10, p15], changes, "2026-10-01", {
      "p-10a": { unitPrice: 45000 },
      "p-15a": { unitPrice: 45000, fixedFee: 0 },
    });
    expect(usagePriceDraftState(half[0])).toBe("invalid");
    expect(usagePriceDraftState(half[1])).toBe("ready");
    expect(canSaveUsagePrices(half)).toBe(false);

    const zero = usagePriceDraftsOf([p15], changes, "2026-10-01", {
      "p-15a": { unitPrice: 0, fixedFee: 10 },
    });
    expect(usagePriceDraftState(zero[0])).toBe("invalid");

    const cleared = usagePriceDraftsOf([p10], changes, "2026-09-01", {
      "p-10a": { unitPrice: null, fixedFee: null },
    });
    expect(usagePriceDraftState(cleared[0])).toBe("invalid");
    expect(hasUsagePriceEdits(cleared)).toBe(true);
  });

  it("TC-UMP-09 a plan whose currency changed saves the same numbers again in the new currency", () => {
    const usd = { ...p10, currencyId: null };
    const [draft] = usagePriceDraftsOf([usd], changes, "2026-09-01", {});
    expect(usagePriceDraftState(draft)).toBe("ready");
  });

  it("TC-UMP-10 nothing typed means nothing to save and nothing to lose", () => {
    const drafts = usagePriceDraftsOf([p10, p15], changes, "2026-10-01", {});
    expect(hasUsagePriceEdits(drafts)).toBe(false);
    expect(canSaveUsagePrices(drafts)).toBe(false);
  });
});
