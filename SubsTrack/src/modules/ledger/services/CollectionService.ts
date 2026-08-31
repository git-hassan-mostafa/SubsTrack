import type { BranchFilter } from '@/src/core/constants';
import type { DbCollection } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import type {
  AllocationLine,
  CashRow,
  ChargeKind,
  Collection,
  CollectionListItem,
  OpenItem,
  WalletSource,
} from '@/src/core/types';
import { nowIso } from '@/src/core/offline/ids';
import { chargeService } from './ChargeService';
import repository from '../repository/CollectionRepository';
import type { CreateChargePayload } from '../repository/IChargeRepository';
import type {
  CreateCollectionItemPayload,
  FindCollectionsOptions,
} from '../repository/ICollectionRepository';
import { mapDbCollectionToCollection } from '../utils/mapper';
import { chargeLabel } from '../utils/openItems';
import { allocate, keyOf } from '../utils/waterfall';

export interface CollectInput {
  tenantId: string;
  customerId: string | null;
  branchId: string | null;
  /** The physical cash handed over. */
  amount: number;
  /** MUST match every charge it pays — a collection is single-currency. */
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  receivedAt: string;
  receivedByUserId: string | null;
  notes?: string | null;
  /** The split, already previewed by the collect sheet. */
  lines: AllocationLine[];
}

/**
 * Money: taking it, correcting it, undoing it.
 *
 * Bills are ChargeService's job. The one place the two meet is here — a line
 * that pays a VIRTUAL month has to raise its bill in the same write, because
 * collecting the money is precisely what turns a month into a bill.
 */
class CollectionService {
  // ── The waterfall ─────────────────────────────────────────────────────────

  /**
   * Propose a split. Pure pass-through to the allocator, kept here so the sheet
   * has one seam and never imports the algorithm directly.
   */
  preview(amount: number, items: OpenItem[], excludedKeys: ReadonlySet<string> = new Set()) {
    return allocate(
      amount,
      items.filter((i) => !excludedKeys.has(keyOf(i))),
    );
  }

  /**
   * Record one hand-over of cash.
   *
   * Everything lands in ONE write: the bills the split just materialized, the
   * header, and its items. Offline that is a single transaction, so cash can
   * never be recorded against a bill that failed to save.
   */
  async collect(input: CollectInput): Promise<Collection> {
    const { lines } = input;
    if (lines.length === 0) throw new Error(i18n.t('errors.collect_no_lines'));
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(i18n.t('errors.collect_amount_positive'));
    }
    if (!(input.ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));

    // One currency per hand-over. Without this a balance could only be closed
    // through a rate conversion, and it would never land on exactly zero. An
    // OPEN month is the one exception: it has no bill and no currency yet, so
    // the hand-over's currency is what its bill will be raised in.
    for (const line of lines) {
      if (!line.item.openAmount && line.item.currencyId !== input.currencyId) {
        throw new Error(i18n.t('errors.collect_currency_mismatch'));
      }
      if (line.amount <= 0) throw new Error(i18n.t('errors.collect_amount_positive'));
      if (line.amount > ceilingOf(line) + EPSILON) {
        throw new Error(i18n.t('errors.collect_exceeds_balance'));
      }
    }

    // Overpay is refused: the header must equal the sum of its items, and no
    // item may exceed its bill. There is nowhere for unapplied cash to live.
    const allocated = lines.reduce((sum, l) => sum + l.amount, 0);
    if (Math.abs(allocated - input.amount) > EPSILON) {
      throw new Error(i18n.t('errors.collect_split_mismatch'));
    }
    if (input.amount > lines.reduce((sum, l) => sum + ceilingOf(l), 0) + EPSILON) {
      throw new Error(i18n.t('errors.collect_exceeds_owed'));
    }

    // A VIRTUAL month has no bill yet. Its id is derived from the natural key,
    // so a second device collecting the same month converges on this same row.
    const charges: CreateChargePayload[] = [];
    const items: CreateCollectionItemPayload[] = [];
    for (const line of lines) {
      const chargeId = line.item.chargeId ?? (await this.materialize(input, line, charges));
      items.push({ tenant_id: input.tenantId, charge_id: chargeId, amount: line.amount });
    }

    const row = await repository.create({
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: input.customerId,
      amount: input.amount,
      currency_id: input.currencyId,
      rate_per_usd_snapshot: input.ratePerUsdSnapshot,
      received_at: input.receivedAt,
      received_by_user_id: input.receivedByUserId,
      notes: input.notes ?? null,
      items,
      charges,
    });
    return mapDbCollectionToCollection(row);
  }

  /** Raise the bill for a month that money has just reached. */
  private async materialize(
    input: CollectInput,
    line: AllocationLine,
    into: CreateChargePayload[],
  ): Promise<string> {
    const { item } = line;
    if (!item.customerPlanId || !item.billingMonth) {
      throw new Error(i18n.t('errors.collect_unknown_item'));
    }
    const id = await chargeService.monthChargeId(item.customerPlanId, item.billingMonth);
    into.push({
      id,
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: item.customerId,
      kind: 'month',
      customer_plan_id: item.customerPlanId,
      billing_month: item.billingMonth,
      duration_months: item.durationMonths,
      plan_id: item.planId,
      sale_id: null,
      description: null,
      // An OPEN month with no typed amount is billed for exactly what arrived —
      // there was no price to bill before this. Its currency is the hand-over's,
      // since it had none of its own either.
      amount: item.amount > 0 ? item.amount : line.amount,
      currency_id: item.openAmount ? input.currencyId : item.currencyId,
      rate_per_usd_snapshot: item.openAmount
        ? input.ratePerUsdSnapshot
        : item.ratePerUsdSnapshot,
      // Raised now, but OWED since its billing day — ageing reads due_date, so
      // a January month collected in March is still 60+ days late.
      issued_at: nowIso(),
      due_date: item.dueDate,
      recorded_by_user_id: input.receivedByUserId,
      notes: null,
    });
    return id;
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<Collection | null> {
    const row = await repository.findById(id);
    return row ? mapDbCollectionToCollection(row) : null;
  }

  /**
   * The money-in history: all customers, one customer, or one wallet. One list
   * replaces both the payments history and the old debt-payments history —
   * there is no such thing as a "debt payment" any more.
   */
  async getHistory(opts: FindCollectionsOptions): Promise<CollectionListItem[]> {
    const rows = await repository.find({ ...opts, includeVoided: opts.includeVoided ?? true });
    return rows.map((row) => this.toListItem(row));
  }

  /** One DB row as a list item — labels frozen at read time. */
  private toListItem(row: DbCollection): CollectionListItem {
    {
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
        branchId: c.branchId,
        notes: c.notes,
        voidedAt: c.voidedAt,
        voidReason: c.voidReason,
        itemCount: items.length,
        // Labelled here, from the DB row, so the list never re-derives what a
        // charge is called — chargeLabel is the one answer for every kind.
        itemLabels: dbItems.map((it) => (it.charges ? chargeLabel(it.charges) : '')),
        items,
        // What the money paid for. 'mixed' is honest: a hand-over can settle a
        // month AND a sale, and no allocation could split the cash between them.
        kind: kindOf(dbItems.map((it) => it.charges?.kind)),
      };
    }
  }

  /** The history's section headers: "YYYY-MM" → USD, over ALL matching rows. */
  getMonthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    return repository.monthlyTotals(opts);
  }

  /** Every payment made against one bill — the bill sheet's payments list. */
  async getPaymentsForCharge(chargeId: string): Promise<Collection[]> {
    const items = await repository.findItemsForCharges([chargeId]);
    const collections = await Promise.all(
      Array.from(new Set(items.map((i) => i.collection_id))).map((id) => repository.findById(id)),
    );
    return collections
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map(mapDbCollectionToCollection)
      // Oldest first, createdAt breaking the tie — same-day hand-overs share
      // one received_at whenever the day was back-dated.
      .sort(
        (a, b) =>
          a.receivedAt.localeCompare(b.receivedAt) || a.createdAt.localeCompare(b.createdAt),
      );
  }

  // ── Corrections ───────────────────────────────────────────────────────────

  /**
   * Undo one hand-over. Every balance it touched comes back on its own, because
   * a balance is a sum over live items and this row stops being one.
   *
   * A month bill left at zero collected is deliberately KEPT: it holds the
   * frozen price, so re-collecting that month bills the customer what he was
   * originally billed. It is invisible everywhere — the grid and the debt rule
   * both key off money, never on whether a row exists.
   */
  async voidCollection(id: string, voidedBy: string, reason: string | null): Promise<Collection> {
    const existing = await repository.findById(id);
    if (!existing) throw new Error(i18n.t('errors.collection_not_found'));
    if (existing.voided_at) throw new Error(i18n.t('errors.collection_already_voided'));
    const row = await repository.void(id, voidedBy, reason);
    return mapDbCollectionToCollection(row);
  }

  /** Undo several hand-overs under one reason — the history's multi-select. */
  async voidCollections(
    ids: string[],
    voidedBy: string,
    reason: string | null,
  ): Promise<Collection[]> {
    const out: Collection[] = [];
    for (const id of ids) out.push(await this.voidCollection(id, voidedBy, reason));
    return out;
  }

  // ── Money in ──────────────────────────────────────────────────────────────

  /** Cash that arrived in a window, one row per bill it settled. */
  collectedInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<CashRow[]> {
    return repository.collectedInRange(startIso, endExclusiveIso, branchFilter);
  }

  // ── Collector wallet ──────────────────────────────────────────────────────

  /**
   * The cash a user — or everyone in scope — is physically holding.
   *
   * Returns the same shape as the history list, so the wallet reads a labelled
   * hand-over instead of re-deriving what each one settled.
   */
  async getHeld(
    branchFilter: BranchFilter,
    holderUserId: string | null,
  ): Promise<CollectionListItem[]> {
    const rows = holderUserId
      ? await repository.findHeld(holderUserId, branchFilter)
      : await repository.findAllHeld(branchFilter);
    return rows.map((row) => this.toListItem(row));
  }

  transferCustody(ids: string[], fromUserId: string, toUserId: string | null, actorUserId: string) {
    return repository.transferCustody(ids, fromUserId, toUserId, actorUserId);
  }
}

/**
 * The most one line may take. Normally the bill's remaining balance — but an
 * OPEN month (a line with no set price) whose amount was never typed has no
 * bill to cap it: whatever is handed over becomes the bill.
 */
function ceilingOf(line: AllocationLine): number {
  return line.item.openAmount && line.item.balance <= 0 ? line.amount : line.item.balance;
}

/** The one kind every line shares, or 'mixed' when they disagree. */
function kindOf(kinds: (ChargeKind | undefined)[]): WalletSource {
  const present = kinds.filter((k): k is ChargeKind => !!k);
  if (present.length === 0) return 'mixed';
  return present.every((k) => k === present[0]) ? present[0] : 'mixed';
}

/** Money is NUMERIC(20,8); compare with a tolerance well below one cent. */
const EPSILON = 1e-6;

export const collectionService = new CollectionService();
