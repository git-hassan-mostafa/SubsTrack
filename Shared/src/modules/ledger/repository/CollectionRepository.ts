import { BaseRepository } from "@shared/core/utils/BaseRepository";
import { PAGE_SIZE, type BranchFilter } from "@shared/core/constants";
import type { CashRow, CashStream, Page } from "@shared/core/types";
import type {
  DbCharge,
  DbCollection,
  DbCollectionItem,
} from "@shared/core/types/db";
import { inChunks } from "@shared/core/utils/chunk";
import { newId } from "@shared/core/utils/ids";
import { sanitizeSearchTerm } from "@shared/core/utils/searchTerm";
import {
  custodyValues,
  receivedCustody,
} from "@shared/modules/wallet/utils/custodyValues";
import type {
  CollectionPageQuery,
  CollectionSwap,
  CollectionSwapResult,
  CreateCollectionItemPayload,
  CreateCollectionPayload,
  FindCollectionsOptions,
  ICollectionRepository,
} from "@shared/modules/ledger/repository/ICollectionRepository";
import type { CreateChargePayload } from "@shared/modules/ledger/repository/IChargeRepository";
import {
  monthBillKey,
  patchForIncomingCash,
  resolveBillTarget,
} from "@shared/modules/ledger/repository/chargeRevive";
import { collectionPlanId } from "@shared/modules/ledger/utils/collectionPlan";
import { sumByMonth } from "@shared/modules/ledger/utils/monthTotals";

// A longer id list overflows the request URL of one UPDATE.
const IDS_PER_WRITE = 100;
const COLLECTION_SELECT = "*, collection_items(*, charges(*)), customers(*)";
const COLLECTION_SELECT_SEARCH =
  "*, collection_items(*, charges(*)), customers!inner(*)";
const COLLECTION_SELECT_PLAN = "*, collection_items(charges(plan_id))";

// The plan named on a hand-over's audit row, off the bills its items point at.
function collectionPlanOf(row: DbCollection | null): string | null {
  return collectionPlanId(
    (row?.collection_items ?? []).map((it) => it.charges?.plan_id),
  );
}

interface LastPaidRow {
  customer_id: string;
  last_paid_at: string;
}

// The joined shape `collectedInRange` reads — one settled bill plus the
// hand-over it came in on.
interface CollectedItemRow {
  id: string;
  amount: number;
  charges: {
    kind: CashStream;
    plan_id: string | null;
    description: string | null;
    billing_month: string | null;
  };
  collections: {
    id: string;
    received_at: string;
    currency_id: string | null;
    rate_per_usd_snapshot: number;
    branch_id: string | null;
    received_by_user_id: string | null;
    customer_id: string | null;
    notes: string | null;
    customers?: { name: string } | null;
  };
}

function toCashRow(r: CollectedItemRow): CashRow {
  const c = r.collections;
  return {
    id: r.id,
    collectionId: c.id,
    date: c.received_at,
    amount: Number(r.amount),
    currencyId: c.currency_id,
    ratePerUsdSnapshot: Number(c.rate_per_usd_snapshot),
    branchId: c.branch_id,
    receivedByUserId: c.received_by_user_id,
    customerId: c.customer_id,
    customerName: c.customers?.name ?? null,
    planId: r.charges.plan_id,
    label: r.charges.description ?? r.charges.billing_month ?? c.notes,
    stream: r.charges.kind,
  };
}
const COLLECTION_SELECT_LEAN = "*, customers(*)";

interface MonthTotalRow {
  received_at: string;
  amount: number;
  rate_per_usd_snapshot: number;
}

interface ListFilterQuery<T> {
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  ilike(column: string, pattern: string): T;
}

export class CollectionRepository
  extends BaseRepository
  implements ICollectionRepository
{
  async findById(id: string): Promise<DbCollection | null> {
    const { data, error } = await this.db
      .from("collections")
      .select(COLLECTION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbCollection) ?? null;
  }

  async findByIds(ids: string[]): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.db
      .from("collections")
      .select(COLLECTION_SELECT)
      .in("id", ids);
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async find(opts: FindCollectionsOptions): Promise<DbCollection[]> {
    const limit = opts.limit ?? PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await this.listQuery(opts, false).range(
      offset,
      offset + limit - 1,
    );
    if (error) this.handleError(error);
    return (data ?? []) as DbCollection[];
  }

  async findPage(query: CollectionPageQuery): Promise<Page<DbCollection>> {
    const { data, error, count } = await this.listQuery(query, true).range(
      query.offset,
      query.offset + query.limit - 1,
    );
    if (error) this.handleError(error);
    return { rows: (data ?? []) as DbCollection[], total: count ?? 0 };
  }

  // One shape for a list read and its page count, so the two never disagree.
  private listQuery(opts: FindCollectionsOptions, counted: boolean) {
    const search = sanitizeSearchTerm(opts.searchTerm);
    const asc = opts.sortDirection === "asc";
    const sortField = opts.sortField ?? "received_at";
    let query = this.db
      .from("collections")
      .select(
        search ? COLLECTION_SELECT_SEARCH : COLLECTION_SELECT,
        counted ? { count: "exact" } : undefined,
      )
      .order(sortField, { ascending: asc });
    if (sortField !== "created_at")
      query = query.order("created_at", { ascending: asc });
    query = query.order("id", { ascending: asc });
    if (!opts.includeVoided) query = query.is("voided_at", null);
    if (opts.voidedOnly) query = query.not("voided_at", "is", null);
    return this.applyListFilters(query, opts);
  }

  async monthlyTotals(
    opts: FindCollectionsOptions,
  ): Promise<Record<string, number>> {
    if (opts.voidedOnly) return {};
    const search = sanitizeSearchTerm(opts.searchTerm);
    const rows = await this.readEveryRow<MonthTotalRow>((from, to) =>
      this.applyListFilters(
        this.db
          .from("collections")
          .select(
            search
              ? "received_at, amount, rate_per_usd_snapshot, customers!inner(name)"
              : "received_at, amount, rate_per_usd_snapshot",
            { count: "exact" },
          )
          .is("voided_at", null)
          .order("id")
          .range(from, to),
        opts,
      ),
    );
    return sumByMonth(rows);
  }

  // Every filter but the void ones, which a list and a total read differently.
  private applyListFilters<T extends ListFilterQuery<T>>(
    query: T,
    opts: FindCollectionsOptions,
  ): T {
    let q = query;
    if (opts.kind) q = q.eq("kind", opts.kind);
    if (opts.customerId) q = q.eq("customer_id", opts.customerId);
    if (opts.heldByUserId) q = q.eq("held_by_user_id", opts.heldByUserId);
    if (opts.receivedByUserId)
      q = q.eq("received_by_user_id", opts.receivedByUserId);
    if (opts.startIso) q = q.gte("received_at", opts.startIso);
    if (opts.endExclusiveIso) q = q.lt("received_at", opts.endExclusiveIso);
    const search = sanitizeSearchTerm(opts.searchTerm);
    if (search) q = q.ilike("customers.name", `%${search}%`);
    return this.applyBranchFilter(
      q,
      opts.branchFilter ?? null,
      this.BRANCH_SCOPES.collections,
    );
  }

  // `includeVoided` is for DISPLAY only — every money path must leave it off.
  async findItemsForCharges(
    chargeIds: string[],
    includeVoided = false,
  ): Promise<DbCollectionItem[]> {
    if (chargeIds.length === 0) return [];
    let query = this.db
      .from("collection_items")
      .select("*, collections!inner(*)")
      .in("charge_id", chargeIds);
    if (!includeVoided) query = query.is("collections.voided_at", null);
    const { data, error } = await query;
    if (error) this.handleError(error);
    return (data ?? []) as DbCollectionItem[];
  }

  /** Both sides `resolveBillTarget` weighs: who holds the month, who holds the id. */
  private async findBillOwners(
    charges: CreateChargePayload[],
  ): Promise<{ byKey: Map<string, DbCharge>; byId: Map<string, DbCharge> }> {
    const { data: idRows, error: idError } = await this.db
      .from("charges")
      .select("*")
      .in(
        "id",
        charges.map((c) => c.id),
      );
    if (idError) this.handleError(idError);
    const byId = new Map(((idRows ?? []) as DbCharge[]).map((r) => [r.id, r]));

    const byKey = new Map<string, DbCharge>();
    const keyed = charges.filter((c) => monthBillKey(c) !== null);
    if (keyed.length === 0) return { byKey, byId };

    const { data: keyRows, error: keyError } = await this.db
      .from("charges")
      .select("*")
      .in("customer_plan_id", [
        ...new Set(keyed.map((c) => c.customer_plan_id as string)),
      ])
      .in("billing_month", [
        ...new Set(keyed.map((c) => c.billing_month as string)),
      ]);
    if (keyError) this.handleError(keyError);
    for (const row of (keyRows ?? []) as DbCharge[])
      byKey.set(monthBillKey(row) as string, row);
    return { byKey, byId };
  }

  private async reviveTargetBill(
    row: DbCharge,
    next: CreateChargePayload,
    paid: number,
  ): Promise<DbCharge> {
    const patch = patchForIncomingCash(row, next, paid);
    if (Object.keys(patch).length === 0) return row;

    const { data, error } = await this.db
      .from("charges")
      .update(patch)
      .eq("id", row.id)
      .select("*, customers(*)")
      .single();
    if (error) this.handleError(error);
    const after = data as DbCharge;
    this.audit({
      table: "charges",
      recordId: row.id,
      action: "update",
      before: row,
      after,
      branchId: after.branch_id,
      customerId: after.customer_id ?? undefined,
    });
    return after;
  }

  private async raiseTargetBills(
    raise: { payloadId: string; payload: CreateChargePayload }[],
    into: Map<string, DbCharge>,
  ): Promise<void> {
    if (raise.length === 0) return;
    const { data, error } = await this.db
      .from("charges")
      .upsert(
        raise.map((r) => r.payload),
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select();
    if (error) this.handleError(error);

    const rows = new Map(((data ?? []) as DbCharge[]).map((r) => [r.id, r]));
    for (const row of rows.values()) {
      this.audit({
        table: "charges",
        recordId: row.id,
        action: "create",
        after: row,
        branchId: row.branch_id,
        customerId: row.customer_id ?? undefined,
      });
    }
    for (const { payloadId, payload } of raise) {
      const row = rows.get(payload.id);
      if (row) into.set(payloadId, row);
    }
  }

  /** Payload id → the bill that really exists; the items MUST point at those. */
  private async resolveTargetBills(
    charges: CreateChargePayload[],
  ): Promise<Map<string, DbCharge>> {
    const resolved = new Map<string, DbCharge>();
    if (charges.length === 0) return resolved;

    const { byKey, byId } = await this.findBillOwners(charges);
    const paidById = await this.paidByCharge([
      ...new Set([...byKey.values(), ...byId.values()].map((r) => r.id)),
    ]);

    const raise: { payloadId: string; payload: CreateChargePayload }[] = [];
    for (const next of charges) {
      const key = monthBillKey(next);
      const target = resolveBillTarget(
        next,
        key ? byKey.get(key) : null,
        byId.get(next.id),
      );
      if ("reuse" in target) {
        const row = target.reuse;
        resolved.set(
          next.id,
          await this.reviveTargetBill(row, next, paidById.get(row.id) ?? 0),
        );
        continue;
      }
      raise.push({
        payloadId: next.id,
        payload: target.idTaken ? { ...next, id: newId() } : next,
      });
    }

    await this.raiseTargetBills(raise, resolved);
    return resolved;
  }

  private async paidByCharge(
    chargeIds: string[],
  ): Promise<Map<string, number>> {
    const items = await this.findItemsForCharges(chargeIds);
    const paid = new Map<string, number>();
    for (const it of items) {
      paid.set(it.charge_id, (paid.get(it.charge_id) ?? 0) + Number(it.amount));
    }
    return paid;
  }

  /** Every bill the items point at: the ones just raised plus the ones already there. */
  private async settledBills(
    bills: Map<string, DbCharge>,
    items: CreateCollectionItemPayload[],
  ): Promise<Map<string, DbCharge>> {
    const targets = new Map<string, DbCharge>();
    for (const row of bills.values()) targets.set(row.id, row);
    const missing = [
      ...new Set(
        items.map((it) => it.charge_id).filter((cid) => !targets.has(cid)),
      ),
    ];
    if (missing.length === 0) return targets;
    const { data, error } = await this.db
      .from("charges")
      .select("*")
      .in("id", missing);
    if (error) this.handleError(error);
    for (const row of (data ?? []) as DbCharge[]) targets.set(row.id, row);
    return targets;
  }

  async create(payload: CreateCollectionPayload): Promise<DbCollection> {
    const { items, charges, custody, ...header } = payload;

    const bills = await this.resolveTargetBills(charges);
    const itemPayloads = items.map((it) => ({
      ...it,
      charge_id: bills.get(it.charge_id)?.id ?? it.charge_id,
    }));
    const targets = await this.settledBills(bills, itemPayloads);

    const { data, error } = await this.db
      .from("collections")
      .insert({
        ...header,
        ...(custody ?? receivedCustody(header.received_by_user_id)),
      })
      .select(COLLECTION_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const created = data as DbCollection;

    const { data: itemData, error: itemsError } = await this.db
      .from("collection_items")
      .insert(itemPayloads.map((it) => ({ ...it, collection_id: created.id })))
      .select();
    if (itemsError) this.handleError(itemsError);
    const itemRows = (itemData ?? []) as DbCollectionItem[];

    this.audit({
      table: "collections",
      recordId: created.id,
      action: "create",
      after: {
        ...created,
        collection_items: itemPayloads,
        plan_id: collectionPlanId(
          itemPayloads.map((it) => targets.get(it.charge_id)?.plan_id),
        ),
      },
      branchId: created.branch_id,
      customerId: created.customer_id ?? undefined,
      subject: created.customers?.name ?? null,
    });

    return {
      ...created,
      collection_items: itemRows.map((it) => ({
        ...it,
        charges: targets.get(it.charge_id) ?? null,
      })),
    };
  }

  async void(
    id: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCollection> {
    const { data: priorData } = await this.db
      .from("collections")
      .select(COLLECTION_SELECT_PLAN)
      .eq("id", id)
      .maybeSingle();
    const prior = (priorData as DbCollection) ?? null;
    const planId = collectionPlanOf(prior);
    const { data, error } = await this.db
      .from("collections")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        void_reason: reason,
      })
      .eq("id", id)
      .is("voided_at", null)
      .select(COLLECTION_SELECT_LEAN)
      .single();
    if (error) this.handleError(error);
    const voided = data as DbCollection;
    this.audit({
      table: "collections",
      recordId: id,
      action: "void",
      before: prior ? { ...prior, plan_id: planId } : prior,
      after: { ...voided, plan_id: planId },
      customerId: voided.customer_id ?? undefined,
      branchId: voided.branch_id,
      subject: voided.customers?.name ?? null,
    });
    return voided;
  }

  async voidMany(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<DbCollection[]> {
    if (ids.length === 0) return [];
    const { data: priors } = await this.db
      .from("collections")
      .select(COLLECTION_SELECT_PLAN)
      .in("id", ids);
    const priorById = new Map(
      ((priors ?? []) as DbCollection[]).map((c) => [c.id, c]),
    );
    const { data, error } = await this.db
      .from("collections")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: voidedBy,
        void_reason: reason,
      })
      .in("id", ids)
      .is("voided_at", null)
      .select(COLLECTION_SELECT_LEAN);
    if (error) this.handleError(error);
    const voided = (data ?? []) as DbCollection[];
    for (const row of voided) {
      const prior = priorById.get(row.id) ?? null;
      const planId = collectionPlanOf(prior);
      this.audit({
        table: "collections",
        recordId: row.id,
        action: "void",
        before: prior ? { ...prior, plan_id: planId } : prior,
        after: { ...row, plan_id: planId },
        customerId: row.customer_id ?? undefined,
        branchId: row.branch_id,
        subject: row.customers?.name ?? null,
      });
    }
    return voided;
  }

  // Web has no transaction to share, so the void goes first — gotcha #171.
  async replace(
    swaps: CollectionSwap[],
    voidedBy: string,
    reason: string | null,
  ): Promise<CollectionSwapResult> {
    const voided = await this.voidMany(
      swaps.map((s) => s.id),
      voidedBy,
      reason,
    );
    const voidedIds = new Set(voided.map((v) => v.id));
    const created: DbCollection[] = [];
    for (const swap of swaps) {
      if (swap.replacement && voidedIds.has(swap.id))
        created.push(await this.create(swap.replacement));
    }
    return { voided, created };
  }

  async collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    let query = this.db
      .from("collection_items")
      .select(
        "id, amount, charges!inner(kind, plan_id, description, billing_month), " +
          "collections!inner(id, received_at, currency_id, rate_per_usd_snapshot, branch_id, " +
          "received_by_user_id, customer_id, notes, voided_at, customers(name))",
      )
      .is("collections.voided_at", null)
      .gte("collections.received_at", startIso)
      .lt("collections.received_at", endExclusiveIso);
    query = this.applyBranchFilter(query, branchFilter, {
      ...this.BRANCH_SCOPES.collections,
      kind: "inherited",
      joinedTable: "collections",
    });
    const { data, error } = await query;
    if (error) this.handleError(error);
    return ((data ?? []) as unknown as CollectedItemRow[]).map(toCashRow);
  }

  findHeld(userId: string, branchFilter: BranchFilter): Promise<DbCollection[]> {
    return this.readHeld(userId, branchFilter);
  }

  findAllHeld(branchFilter: BranchFilter): Promise<DbCollection[]> {
    return this.readHeld(null, branchFilter);
  }

  // A wallet total sums every held row — gotcha #175.
  private readHeld(
    holderUserId: string | null,
    branchFilter: BranchFilter,
  ): Promise<DbCollection[]> {
    return this.readEveryRow<DbCollection>((from, to) => {
      const live = this.db
        .from("collections")
        .select(COLLECTION_SELECT, { count: "exact" })
        .is("voided_at", null);
      const held = holderUserId
        ? live.eq("held_by_user_id", holderUserId)
        : live.not("held_by_user_id", "is", null);
      return this.applyBranchFilter(
        held,
        branchFilter,
        this.BRANCH_SCOPES.collections,
      )
        .order("id")
        .range(from, to);
    });
  }

  async lastReceivedByCustomer(): Promise<Map<string, string>> {
    const rows = await this.readEveryRow<LastPaidRow>((from, to) =>
      this.db
        .rpc("customer_last_paid", {}, { count: "exact" })
        .order("customer_id")
        .range(from, to),
    );
    return new Map(rows.map((r) => [r.customer_id, r.last_paid_at]));
  }

  async transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ): Promise<void> {
    const custody = custodyValues(toUserId, actorUserId);
    for (const chunk of inChunks(ids, IDS_PER_WRITE)) {
      const { error } = await this.db
        .from("collections")
        .update(custody)
        .in("id", chunk)
        .eq("held_by_user_id", fromUserId)
        .is("voided_at", null);
      if (error) this.handleError(error);
    }
  }
}
