import type { BranchFilter } from "@/src/core/constants";
import type { DbCollection } from "@/src/core/types/db";
import i18n from "@/src/core/i18n";
import type {
  AllocationLine,
  AuditRecordTarget,
  CashRow,
  Collection,
  CollectionListItem,
  OpenItem,
  WalletSource,
} from "@/src/core/types";
import { deterministicId, nowIso } from "@/src/core/offline/ids";
import {
  custodyOf,
  sharedCustody,
  type CustodyValues,
} from "@/src/modules/wallet/utils/custodyValues";
import { chargeService } from "./ChargeService";
import repository from "../repository/CollectionRepository";
import type { CreateChargePayload } from "../repository/IChargeRepository";
import type {
  CreateCollectionItemPayload,
  CreateCollectionPayload,
  FindCollectionsOptions,
} from "../repository/ICollectionRepository";
import { mapDbCollectionToCollection } from "../utils/mapper";
import { collectionKind } from "../utils/collectionKind";
import { hasClosedBill, withoutCollection } from "../utils/correction";
import { chargeLabel } from "../utils/openItems";
import { amountByCharge, paidToCharge } from "../utils/paidToCharge";
import { allocate, keyOf } from "../utils/waterfall";

export interface CollectInput {
  tenantId: string;
  customerId: string | null;
  branchId: string | null;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  receivedAt: string;
  receivedByUserId: string | null;
  notes?: string | null;
  lines: AllocationLine[];
  custody?: CustodyValues;
}

type CollectHeader = Omit<CollectInput, "amount" | "lines" | "custody">;

export interface MultiCollectResult {
  collections: Collection[];
  failed: Error | null;
}

/** What `unpayCharge` pulled back off one bill, and where that cash came from. */
export interface UnpaidCash {
  amount: number;
  receivedAt: string | null;
  receivedByUserId: string | null;
  branchId: string | null;
  custody: CustodyValues | null;
}

export interface CorrectCollectionInput {
  collectionId: string;
  amount: number;
  actorUserId: string;
  reason: string | null;
}

// The bills a hand-over paid, each owing what it would owe without it.
export interface CorrectionDraft {
  collection: Collection;
  pool: OpenItem[];
}

export interface CollectionCorrection {
  voided: Collection;
  replacement: Collection;
}

// Money: taking it, correcting it, undoing it. Bills are ChargeService's job.
class CollectionService {
  preview(
    amount: number,
    items: OpenItem[],
    excludedKeys: ReadonlySet<string> = new Set(),
  ) {
    return allocate(
      amount,
      items.filter((i) => !excludedKeys.has(keyOf(i))),
    );
  }

  async collect(input: CollectInput): Promise<Collection> {
    const row = await repository.create(await this.toPayload(input));
    return mapDbCollectionToCollection(row);
  }

  // Every rule a hand-over must pass, shared by collecting and correcting.
  private async toPayload(
    input: CollectInput,
  ): Promise<CreateCollectionPayload> {
    const { lines } = input;
    if (lines.length === 0) throw new Error(i18n.t("errors.collect_no_lines"));
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(i18n.t("errors.collect_amount_positive"));
    }
    if (!(input.ratePerUsdSnapshot > 0))
      throw new Error(i18n.t("errors.rate_snapshot_positive"));

    for (const line of lines) {
      if (!line.item.openAmount && line.item.currencyId !== input.currencyId) {
        throw new Error(i18n.t("errors.collect_currency_mismatch"));
      }
      if (line.amount <= 0)
        throw new Error(i18n.t("errors.collect_amount_positive"));
      if (line.amount > ceilingOf(line) + EPSILON) {
        throw new Error(i18n.t("errors.collect_exceeds_balance"));
      }
    }

    const allocated = lines.reduce((sum, l) => sum + l.amount, 0);
    if (Math.abs(allocated - input.amount) > EPSILON) {
      throw new Error(i18n.t("errors.collect_split_mismatch"));
    }
    if (
      input.amount >
      lines.reduce((sum, l) => sum + ceilingOf(l), 0) + EPSILON
    ) {
      throw new Error(i18n.t("errors.collect_exceeds_owed"));
    }

    const charges: CreateChargePayload[] = [];
    const items: CreateCollectionItemPayload[] = [];
    for (const line of lines) {
      const chargeId =
        line.item.chargeId ?? (await this.materialize(input, line, charges));
      items.push({
        tenant_id: input.tenantId,
        charge_id: chargeId,
        amount: line.amount,
      });
    }

    return {
      ...headerPayload(
        input,
        input.amount,
        collectionKind(lines.map((l) => l.item.kind)),
      ),
      items,
      charges,
      custody: input.custody,
    };
  }

  /**
   * One customer, several currencies, one tap — a hand-over per currency.
   *
   * Sequential and NOT atomic on purpose: each group is its own physical
   * hand-over, so a group that succeeded is real money and is kept. The caller
   * gets what was written plus the first failure, and re-collects only the rest.
   */
  async collectMulti(inputs: CollectInput[]): Promise<MultiCollectResult> {
    if (inputs.length === 0) throw new Error(i18n.t("errors.collect_no_lines"));
    const collections: Collection[] = [];
    for (const input of inputs) {
      try {
        collections.push(await this.collect(input));
      } catch (e) {
        return {
          collections,
          failed: e instanceof Error ? e : new Error(String(e)),
        };
      }
    }
    return { collections, failed: null };
  }

  private async materialize(
    input: CollectInput,
    line: AllocationLine,
    into: CreateChargePayload[],
  ): Promise<string> {
    const { item } = line;
    if (!item.customerPlanId || !item.billingMonth) {
      throw new Error(i18n.t("errors.collect_unknown_item"));
    }
    const id = await chargeService.monthChargeId(
      item.customerPlanId,
      item.billingMonth,
    );
    into.push({
      id,
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: item.customerId,
      kind: "month",
      customer_plan_id: item.customerPlanId,
      billing_month: item.billingMonth,
      duration_months: item.durationMonths,
      plan_id: item.planId,
      sale_id: null,
      description: null,
      amount: item.amount > 0 ? item.amount : line.amount,
      currency_id: item.openAmount ? input.currencyId : item.currencyId,
      rate_per_usd_snapshot: item.openAmount
        ? input.ratePerUsdSnapshot
        : item.ratePerUsdSnapshot,
      issued_at: nowIso(),
      due_date: item.dueDate,
      recorded_by_user_id: input.receivedByUserId,
      notes: null,
    });
    return id;
  }

  async getById(id: string): Promise<Collection | null> {
    const row = await repository.findById(id);
    return row ? mapDbCollectionToCollection(row) : null;
  }

  // One hand-over for its detail sheet, each bill named with its plan or sale.
  async getListItem(id: string): Promise<CollectionListItem | null> {
    const row = await repository.findById(id);
    if (!row) return null;
    const item = this.toListItem(row);
    const bills = await chargeService.getBills(
      item.items.map((it) => it.chargeId),
    );
    const labels = new Map(bills.map((bill) => [bill.chargeId, bill.label]));
    return {
      ...item,
      itemLabels: item.items.map(
        (it, i) => labels.get(it.chargeId) ?? item.itemLabels[i] ?? "",
      ),
    };
  }

  async getHistory(
    opts: FindCollectionsOptions,
  ): Promise<CollectionListItem[]> {
    const rows = await repository.find({
      ...opts,
      includeVoided: opts.includeVoided ?? true,
    });
    return rows.map((row) => this.toListItem(row));
  }

  private toListItem(row: DbCollection): CollectionListItem {
    const c = mapDbCollectionToCollection(row);
    const items = c.items ?? [];
    const dbItems = row.collection_items ?? [];
    return {
      id: c.id,
      customerId: c.customerId,
      customerName: row.customers?.name ?? null,
      customerPhone: row.customers?.phone_number ?? null,
      amount: c.amount,
      currencyId: c.currencyId,
      ratePerUsdSnapshot: c.ratePerUsdSnapshot,
      receivedAt: c.receivedAt,
      receivedByUserId: c.receivedByUserId,
      heldByUserId: c.heldByUserId,
      remittedAt: c.remittedAt,
      remittedBy: c.remittedBy,
      createdAt: c.createdAt,
      branchId: c.branchId,
      notes: c.notes,
      voidedAt: c.voidedAt,
      voidedBy: c.voidedBy,
      voidReason: c.voidReason,
      itemCount: items.length,
      itemLabels: dbItems.map((it) =>
        it.charges ? chargeLabel(it.charges) : "",
      ),
      items,
      kind: row.kind ?? collectionKind(dbItems.map((it) => it.charges?.kind)),
    };
  }

  getMonthlyTotals(
    opts: FindCollectionsOptions,
  ): Promise<Record<string, number>> {
    return repository.monthlyTotals(opts);
  }

  async getPaymentsForCharge(chargeId: string): Promise<Collection[]> {
    const items = await repository.findItemsForCharges([chargeId], true);
    const collections = await repository.findByIds([
      ...new Set(items.map((i) => i.collection_id)),
    ]);
    return collections
      .map(mapDbCollectionToCollection)
      .sort(
        (a, b) =>
          b.receivedAt.localeCompare(a.receivedAt) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }

  /** Every hand-over that ever touched one bill, as audit targets. */
  async getPaymentTargets(chargeId: string): Promise<AuditRecordTarget[]> {
    const items = await repository.findItemsForCharges([chargeId], true);
    return [...new Set(items.map((i) => i.collection_id))].map((recordId) => ({
      table: "collections" as const,
      recordId,
    }));
  }

  async voidCollection(
    id: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<Collection> {
    const existing = await repository.findById(id);
    if (!existing) throw new Error(i18n.t("errors.collection_not_found"));
    if (existing.voided_at)
      throw new Error(i18n.t("errors.collection_already_voided"));
    const row = await repository.void(id, voidedBy, reason);
    return mapDbCollectionToCollection(row);
  }

  async voidCollections(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<Collection[]> {
    if (ids.length === 0) return [];
    const rows = await repository.voidMany(ids, voidedBy, reason);
    return rows.map(mapDbCollectionToCollection);
  }

  /** Un-pays ONE bill, leaving every other bill it shared cash with — #111. */
  async unpayCharge(
    chargeId: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<UnpaidCash> {
    const payments = (await this.getPaymentsForCharge(chargeId)).filter(
      (payment) => payment.voidedAt === null,
    );
    if (payments.length === 0) return EMPTY_UNPAID;
    const swaps = await Promise.all(
      payments.map(async (payment) => ({
        id: payment.id,
        replacement: await this.keptSlicesOf(payment, chargeId),
      })),
    );
    await repository.replace(swaps, voidedBy, reason);
    const oldest = payments.reduce((a, b) =>
      a.receivedAt <= b.receivedAt ? a : b,
    );
    return {
      amount: payments.reduce((sum, p) => sum + paidToCharge(p, chargeId), 0),
      receivedAt: oldest.receivedAt,
      receivedByUserId: oldest.receivedByUserId,
      branchId: oldest.branchId,
      custody: sharedCustody(payments),
    };
  }

  private async keptSlicesOf(
    payment: Collection,
    chargeId: string,
  ): Promise<CreateCollectionPayload | null> {
    const kept = (payment.items ?? []).filter(
      (item) => item.chargeId !== chargeId,
    );
    if (kept.length === 0) return null;
    return this.asReplacement(payment.id, {
      ...headerPayload(
        replayOf(payment),
        sumItems(kept),
        collectionKind(kept.map((item) => item.charge?.kind)),
      ),
      items: kept.map((item) => ({
        tenant_id: payment.tenantId,
        charge_id: item.chargeId,
        amount: item.amount,
      })),
      charges: [],
      custody: custodyOf(payment),
    });
  }

  // Two devices replacing one hand-over converge on ONE row — gotcha #171.
  private async asReplacement(
    originalId: string,
    payload: CreateCollectionPayload,
  ): Promise<CreateCollectionPayload> {
    const id = await deterministicId("replaces", originalId);
    return {
      ...payload,
      id,
      items: await Promise.all(
        payload.items.map(async (item) => ({
          ...item,
          id: await deterministicId(id, item.charge_id),
        })),
      ),
    };
  }

  async getCorrection(collectionId: string): Promise<CorrectionDraft> {
    const collection = await this.getById(collectionId);
    if (!collection) throw new Error(i18n.t("errors.collection_not_found"));
    if (collection.voidedAt)
      throw new Error(i18n.t("errors.collection_already_voided"));
    const own = amountByCharge(collection.items ?? []);
    const bills = await chargeService.getBills([...own.keys()]);
    if (bills.length !== own.size)
      throw new Error(i18n.t("errors.correct_bill_missing"));
    if (hasClosedBill(bills))
      throw new Error(i18n.t("errors.correct_bill_closed"));
    return { collection, pool: withoutCollection(bills, collection) };
  }

  // Void + re-record in one write; only the amount changes — gotcha #171.
  async correct(input: CorrectCollectionInput): Promise<CollectionCorrection> {
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw new Error(i18n.t("errors.correct_amount_positive"));
    const { collection, pool } = await this.getCorrection(input.collectionId);
    if (Math.abs(input.amount - collection.amount) <= EPSILON)
      throw new Error(i18n.t("errors.correct_amount_unchanged"));
    const { lines, leftover } = this.preview(input.amount, pool);
    if (leftover > EPSILON)
      throw new Error(i18n.t("errors.collect_exceeds_owed"));

    const payload = await this.toPayload({
      ...replayOf(collection),
      amount: input.amount,
      lines,
      custody: custodyOf(collection),
    });
    const { voided, created } = await repository.replace(
      [
        {
          id: collection.id,
          replacement: await this.asReplacement(collection.id, payload),
        },
      ],
      input.actorUserId,
      input.reason,
    );
    const [gone] = voided;
    const [row] = created;
    if (!gone || !row)
      throw new Error(i18n.t("errors.collection_already_voided"));
    return {
      voided: {
        ...collection,
        voidedAt: gone.voided_at,
        voidedBy: gone.voided_by,
        voidReason: gone.void_reason,
        updatedAt: gone.updated_at,
      },
      replacement: mapDbCollectionToCollection(row),
    };
  }

  collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    return repository.collectedInRange(startIso, endExclusiveIso, branchFilter);
  }

  async getHeld(
    branchFilter: BranchFilter,
    holderUserId: string | null,
  ): Promise<CollectionListItem[]> {
    const rows = holderUserId
      ? await repository.findHeld(holderUserId, branchFilter)
      : await repository.findAllHeld(branchFilter);
    return rows.map((row) => this.toListItem(row));
  }

  transferCustody(
    ids: string[],
    fromUserId: string,
    toUserId: string | null,
    actorUserId: string,
  ) {
    return repository.transferCustody(ids, fromUserId, toUserId, actorUserId);
  }
}

/**
 * The most one line may take. Normally the bill's remaining balance — but an
 * OPEN month (a line with no set price) whose amount was never typed has no
 * bill to cap it: whatever is handed over becomes the bill.
 */
function ceilingOf(line: AllocationLine): number {
  return line.item.openAmount && line.item.balance <= 0
    ? line.amount
    : line.item.balance;
}

function sumItems(items: { amount: number }[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

// Everything about a hand-over except its amount and split.
function replayOf(collection: Collection): CollectHeader {
  return {
    tenantId: collection.tenantId,
    customerId: collection.customerId,
    branchId: collection.branchId,
    currencyId: collection.currencyId,
    ratePerUsdSnapshot: collection.ratePerUsdSnapshot,
    receivedAt: collection.receivedAt,
    receivedByUserId: collection.receivedByUserId,
    notes: collection.notes,
  };
}

function headerPayload(
  header: CollectHeader,
  amount: number,
  kind: WalletSource,
): Omit<CreateCollectionPayload, "items" | "charges"> {
  return {
    tenant_id: header.tenantId,
    branch_id: header.branchId,
    customer_id: header.customerId,
    amount,
    currency_id: header.currencyId,
    rate_per_usd_snapshot: header.ratePerUsdSnapshot,
    received_at: header.receivedAt,
    received_by_user_id: header.receivedByUserId,
    notes: header.notes ?? null,
    kind,
  };
}

const EMPTY_UNPAID: UnpaidCash = {
  amount: 0,
  receivedAt: null,
  receivedByUserId: null,
  branchId: null,
  custody: null,
};

const EPSILON = 1e-6;

export const collectionService = new CollectionService();
