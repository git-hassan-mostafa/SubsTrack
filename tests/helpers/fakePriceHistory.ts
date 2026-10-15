import type {
  DbCustomerPlan,
  DbLinePriceChange,
  DbPlan,
  DbPlanPriceChange,
} from "@shared/core/types/db";
import type { IPlanRepository } from "@shared/modules/admin/plans/repository/IPlanRepository";
import type { ICustomerPlanRepository } from "@shared/modules/customer/customer-plans/repository/ICustomerPlanRepository";
import type {
  IPriceHistoryRepository,
  PlanPriceChangePayload,
} from "@shared/modules/customer/customer-plans/repository/IPriceHistoryRepository";

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
  async addLineChange(first, change) {
    append(priceStore.lines, first, change);
  },
  async updatePlanChangeFromMonth(id, planId, fromMonth, oldFromMonth) {
    const row = priceStore.plans.find(
      (r) => r.id === id && r.plan_id === planId,
    );
    if (!row) throw new Error("Price change record not found.");
    row.from_month = fromMonth;
    row.updated_at = new Date().toISOString();
    return row;
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
    if (payload.name) {
      const dup = priceStore.catalog.find(
        (p) => p.id !== id && p.name.toLowerCase() === payload.name?.toLowerCase(),
      );
      if (dup) throw new Error("duplicate key value violates unique constraint \"uq_plans_name_tenant\"");
    }
    const i = priceStore.catalog.findIndex((p) => p.id === id);
    if (i === -1) throw new Error("Plan not found");
    priceStore.catalog[i] = { ...priceStore.catalog[i], ...payload };
    return priceStore.catalog[i];
  },
  async updateWithPriceChange(
    id: string,
    payload: Pick<
      DbPlan,
      | "name"
      | "price"
      | "is_custom_price"
      | "duration_months"
      | "currency_id"
      | "branch_id"
    >,
    first: PlanPriceChangePayload,
    change: Pick<PlanPriceChangePayload, "id" | "from_month" | "created_at">,
  ) {
    if (payload.name) {
      const dup = priceStore.catalog.find(
        (p) => p.id !== id && p.name.toLowerCase() === payload.name?.toLowerCase(),
      );
      if (dup) throw new Error("duplicate key value violates unique constraint \"uq_plans_name_tenant\"");
    }
    const i = priceStore.catalog.findIndex((p) => p.id === id);
    if (i === -1) throw new Error("Plan not found");
    priceStore.catalog[i] = { ...priceStore.catalog[i], ...payload };
    const fullChange: DbPlanPriceChange = {
      id: change.id,
      tenant_id: priceStore.catalog[i].tenant_id,
      plan_id: id,
      from_month: change.from_month,
      price: payload.price,
      currency_id: payload.currency_id,
      duration_months: payload.duration_months,
      is_custom_price: payload.is_custom_price,
      created_at: change.created_at,
      updated_at: change.created_at,
    };
    if (!priceStore.plans.some((r) => r.id === first.id)) {
      priceStore.plans.push({ ...first, updated_at: first.created_at });
    }
    priceStore.plans.push(fullChange);
    return priceStore.catalog[i];
  },
} as unknown as IPlanRepository;
