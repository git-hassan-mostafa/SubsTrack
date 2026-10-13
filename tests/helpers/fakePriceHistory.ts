import type {
  DbCustomerPlan,
  DbLinePriceChange,
  DbPlan,
  DbPlanPriceChange,
} from "@shared/core/types/db";
import type { IPlanRepository } from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { ICustomerPlanRepository } from "@shared/modules/customer/customer-plans/repository/ICustomerPlanRepository";
import type { IPriceHistoryRepository } from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

// In-memory price edits + the plan rows a plan edit reads and writes.
export const priceStore = {
  plans: [] as DbPlanPriceChange[],
  lines: [] as DbLinePriceChange[],
  catalog: [] as DbPlan[],
  reset() {
    this.plans = [];
    this.lines = [];
    this.catalog = [];
  },
};

function append<R extends { id: string; created_at: string }>(
  rows: (R & { updated_at: string })[],
  first: R,
  change: R,
): void {
  if (!rows.some((r) => r.id === first.id)) {
    rows.push({ ...first, updated_at: first.created_at });
  }
  rows.push({ ...change, updated_at: change.created_at });
}

export const fakePriceHistoryRepository: IPriceHistoryRepository = {
  async findPlanChanges(planIds) {
    return priceStore.plans.filter((r) => planIds.includes(r.plan_id));
  },
  async findLineChanges(customerPlanIds) {
    return priceStore.lines.filter((r) => customerPlanIds.includes(r.customer_plan_id));
  },
  async addPlanChange(first, change) {
    append(priceStore.plans, first, change);
  },
  async addLineChange(first, change) {
    append(priceStore.lines, first, change);
  },
};

// Saved service lines + the ids money reached; what syncLines reads and writes.
export const lineStore = {
  rows: [] as DbCustomerPlan[],
  paidLineIds: [] as string[],
  reset() {
    this.rows = [];
    this.paidLineIds = [];
  },
};

export const fakeCustomerPlanRepository = {
  async findPaidLineIds() {
    return lineStore.paidLineIds;
  },
  async update(id: string, payload: Partial<DbCustomerPlan>) {
    const i = lineStore.rows.findIndex((r) => r.id === id);
    lineStore.rows[i] = { ...lineStore.rows[i], ...payload };
    return lineStore.rows[i];
  },
} as unknown as ICustomerPlanRepository;

export const fakePlanRepository = {
  async update(id: string, payload: Partial<DbPlan>) {
    const i = priceStore.catalog.findIndex((p) => p.id === id);
    priceStore.catalog[i] = { ...priceStore.catalog[i], ...payload };
    return priceStore.catalog[i];
  },
} as unknown as IPlanRepository;
