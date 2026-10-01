import type { CustomerStatus } from "@shared/core/types";
import {
  clearOtherBranchPlans,
  lineRowsChanged,
  newLineRow,
  nextLineStartDate,
  rowsFromCustomer,
  toLineDrafts,
  type LineRow,
} from "@shared/modules/customer/customer-plans/utils/lineDrafts";
import { planSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { customerPills } from "@shared/modules/customer/customers/utils/customerPills";
import {
  linePeriodLabel,
  planPriceSublabel,
} from "@shared/modules/admin/plans/utils/planLabels";
import {
  generatePortalPassword,
  PORTAL_PASSWORD_LENGTH,
  portalPasswordOnEnable,
} from "@shared/core/utils/portalPassword";
import { customer, line, plan } from "../helpers/factories";

// TC-CF-* — the customer form's service-line drafts, pills, labels and portal password.

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key) as unknown as Parameters<typeof planSummary>[1];

const TODAY = "2026-09-30";

function row(over: Partial<LineRow> = {}): LineRow {
  return { ...newLineRow(1, "2026-01-01"), ...over };
}

function status(over: Partial<CustomerStatus> = {}): CustomerStatus {
  return {
    status: "unpaid",
    overdue: false,
    planCount: { paid: 0, total: 1 },
    notDueLineIds: [],
    uncoveredLineIds: [],
    unpaidMonths: 0,
    ...over,
  };
}

describe("rowsFromCustomer", () => {
  it("TC-CF-01 a new customer starts with one blank active line dated today", () => {
    const rows = rowsFromCustomer(null, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBeUndefined();
    expect(rows[0]).toMatchObject({ planId: null, startDate: TODAY, status: "active" });
  });

  it("TC-CF-02 saved lines keep their price, currency and cancelled state", () => {
    const rows = rowsFromCustomer(
      customer({
        customerPlans: [
          line({ id: "l1", customPrice: 15, customCurrencyId: "lbp" }),
          line({ id: "l2", active: false }),
        ],
      }),
      TODAY,
    );
    expect(rows.map((r) => [r.key, r.id, r.status])).toEqual([
      ["l1", "l1", "active"],
      ["l2", "l2", "cancelled"],
    ]);
    expect(rows[0]).toMatchObject({ customPrice: 15, customCurrencyId: "lbp" });
  });

  it("TC-CF-03 an added line starts on the last line's start date, else today", () => {
    expect(nextLineStartDate([row({ startDate: "2026-03-01" })], TODAY)).toBe("2026-03-01");
    expect(nextLineStartDate([], TODAY)).toBe(TODAY);
  });
});

describe("toLineDrafts", () => {
  it("TC-CF-04 cancelled rows are not saved as lines", () => {
    const drafts = toLineDrafts([row({ key: "a" }), row({ key: "b", id: "l2", status: "cancelled" })]);
    expect(drafts).toHaveLength(1);
  });

  it("TC-CF-05 a special price keeps its currency", () => {
    const [draft] = toLineDrafts([row({ customPrice: 50000, customCurrencyId: "lbp" })]);
    expect(draft).toMatchObject({ customPrice: 50000, customCurrencyId: "lbp" });
  });

  it("TC-CF-06 no special price (null or 0) sends no price and no currency", () => {
    const drafts = toLineDrafts([
      row({ customPrice: null, customCurrencyId: "lbp" }),
      row({ customPrice: 0, customCurrencyId: "lbp" }),
    ]);
    expect(drafts.map((d) => [d.customPrice, d.customCurrencyId])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
});

describe("clearOtherBranchPlans", () => {
  const shared = plan({ id: "p-shared", branchId: null });
  const north = plan({ id: "p-north", branchId: "north" });

  it("TC-CF-07 a plan owned by another branch is cleared and reported", () => {
    const result = clearOtherBranchPlans([row({ key: "a", planId: "p-north" })], [north], "south");
    expect(result.rows[0].planId).toBeNull();
    expect(result.cleared).toEqual(["a"]);
  });

  it("TC-CF-08 shared, same-branch, unknown and cancelled rows are left alone", () => {
    const rows = [
      row({ key: "a", planId: "p-shared" }),
      row({ key: "b", planId: "p-north" }),
      row({ key: "c", planId: "p-gone" }),
    ];
    const same = clearOtherBranchPlans(rows, [shared, north], "north");
    expect(same.rows).toBe(rows);
    expect(same.cleared).toEqual([]);
    const cancelled = [row({ key: "d", planId: "p-north", status: "cancelled" })];
    expect(clearOtherBranchPlans(cancelled, [north], "south").rows).toBe(cancelled);
  });
});

describe("lineRowsChanged", () => {
  const initial = [row({ key: "a", id: "l1", planId: "p1" })];

  it("TC-CF-09 unchanged rows are not dirty", () => {
    expect(lineRowsChanged(initial, [...initial], [])).toBe(false);
  });

  it("TC-CF-10 a plan the form cleared itself is not a change", () => {
    const rows = [{ ...initial[0], planId: null }];
    expect(lineRowsChanged(initial, rows, ["a"])).toBe(false);
    expect(lineRowsChanged(initial, rows, [])).toBe(true);
  });

  it("TC-CF-11 a currency pick counts only once a special price is typed", () => {
    expect(lineRowsChanged(initial, [{ ...initial[0], customCurrencyId: "lbp" }], [])).toBe(false);
    const priced = [{ ...initial[0], customPrice: 10 }];
    expect(lineRowsChanged(priced, [{ ...priced[0], customCurrencyId: "lbp" }], [])).toBe(true);
  });

  it("TC-CF-12 an added, dropped or cancelled row is a change", () => {
    expect(lineRowsChanged(initial, [...initial, row({ key: "b" })], [])).toBe(true);
    expect(lineRowsChanged(initial, [], [])).toBe(true);
    expect(lineRowsChanged(initial, [{ ...initial[0], status: "cancelled" }], [])).toBe(true);
  });
});

describe("customerPills", () => {
  it("TC-CF-13 inactive and non-regular replace the payment pills", () => {
    const owing = status({ overdue: true });
    expect(customerPills(customer({ active: false }), owing, false)).toEqual(["inactive"]);
    expect(customerPills(customer({ isRegular: false }), owing, false)).toEqual(["non_regular"]);
  });

  it("TC-CF-14 a regular customer shows the month flags; debt always rides along", () => {
    expect(customerPills(customer(), status({ overdue: true }), true)).toEqual(["overdue", "debt"]);
    expect(customerPills(customer({ active: false }), null, true)).toEqual(["inactive", "debt"]);
  });

  it("TC-CF-15 an unknown status shows no payment pill, never a guessed Unpaid", () => {
    expect(customerPills(customer(), null, false)).toEqual([]);
  });
});

describe("labels", () => {
  it("TC-CF-16 plan summary: none, one plan by name, several as a count", () => {
    expect(planSummary(customer(), t)).toBe("common.no_plan");
    const one = customer({ customerPlans: [line({ plan: plan({ name: "Fiber" }) }), line({ active: false })] });
    expect(planSummary(one, t)).toBe("Fiber");
    const two = customer({ customerPlans: [line(), line()] });
    expect(planSummary(two, t)).toBe('subscriptions.count_plans {"count":2}');
  });

  it("TC-CF-17 a line's price names the months it covers", () => {
    expect(linePeriodLabel(1, t)).toBe("subscriptions.per_month");
    expect(linePeriodLabel(3, t)).toBe('subscriptions.per_n_months {"count":3}');
  });

  it("TC-CF-18 a custom-priced plan shows no price in the picker", () => {
    expect(planPriceSublabel(plan({ isCustomPrice: true }), [], null, t)).toBe("common.custom_pricing");
    expect(planPriceSublabel(plan({ price: 20, durationMonths: 1 }), [], null, t)).toBe(
      "$20.00 / plans.per_month",
    );
  });
});

describe("portal password", () => {
  it("TC-CF-19 is 10 characters with no look-alike letters or digits", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePortalPassword();
      expect(password).toHaveLength(PORTAL_PASSWORD_LENGTH);
      expect(password).not.toMatch(/[Il1O0]/);
    }
  });

  it("TC-CF-20 switching the portal on keeps a typed password and fills an empty one", () => {
    expect(portalPasswordOnEnable("mine")).toBe("mine");
    expect(portalPasswordOnEnable("  ")).toHaveLength(PORTAL_PASSWORD_LENGTH);
  });
});
