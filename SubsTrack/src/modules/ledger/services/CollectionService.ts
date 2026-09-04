import type { BranchFilter } from '@/src/core/constants';
import type { DbCollection } from '@/src/core/types/db';
import i18n from '@/src/core/i18n';
import type {
  AllocationLine,
  CashRow,
  Collection,
  CollectionListItem,
  OpenItem,
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
import { collectionKind } from '../utils/collectionKind';
import { chargeLabel } from '../utils/openItems';
import { allocate, keyOf } from '../utils/waterfall';

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
}

/**
 * Money: taking it, correcting it, undoing it.
 *
 * Bills are ChargeService's job. The one place the two meet is here — a line
 * that pays a VIRTUAL month has to raise its bill in the same write, because
 * collecting the money is precisely what turns a month into a bill.
 */
class CollectionService {

  preview(amount: number, items: OpenItem[], excludedKeys: ReadonlySet<string> = new Set()) {
    return allocate(
      amount,
      items.filter((i) => !excludedKeys.has(keyOf(i))),
    );
  }

  async collect(input: CollectInput): Promise<Collection> {
    const { lines } = input;
    if (lines.length === 0) throw new Error(i18n.t('errors.collect_no_lines'));
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error(i18n.t('errors.collect_amount_positive'));
    }
    if (!(input.ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));

    for (const line of lines) {
      if (!line.item.openAmount && line.item.currencyId !== input.currencyId) {
        throw new Error(i18n.t('errors.collect_currency_mismatch'));
      }
      if (line.amount <= 0) throw new Error(i18n.t('errors.collect_amount_positive'));
      if (line.amount > ceilingOf(line) + EPSILON) {
        throw new Error(i18n.t('errors.collect_exceeds_balance'));
      }
    }

    const allocated = lines.reduce((sum, l) => sum + l.amount, 0);
    if (Math.abs(allocated - input.amount) > EPSILON) {
      throw new Error(i18n.t('errors.collect_split_mismatch'));
    }
    if (input.amount > lines.reduce((sum, l) => sum + ceilingOf(l), 0) + EPSILON) {
      throw new Error(i18n.t('errors.collect_exceeds_owed'));
    }

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
      kind: collectionKind(lines.map((l) => l.item.kind)),
      items,
      charges,
    });
    return mapDbCollectionToCollection(row);
  }

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

  async getHistory(opts: FindCollectionsOptions): Promise<CollectionListItem[]> {
    const rows = await repository.find({ ...opts, includeVoided: opts.includeVoided ?? true });
    return rows.map((row) => this.toListItem(row));
  }

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
        voidedBy: c.voidedBy,
        voidReason: c.voidReason,
        itemCount: items.length,
        itemLabels: dbItems.map((it) => (it.charges ? chargeLabel(it.charges) : '')),
        items,
        kind: row.kind ?? collectionKind(dbItems.map((it) => it.charges?.kind)),
      };
    }
  }

  getMonthlyTotals(opts: FindCollectionsOptions): Promise<Record<string, number>> {
    return repository.monthlyTotals(opts);
  }

  async getPaymentsForCharge(chargeId: string): Promise<Collection[]> {
    const items = await repository.findItemsForCharges([chargeId]);
    const collections = await repository.findByIds([
      ...new Set(items.map((i) => i.collection_id)),
    ]);
    return collections
      .map(mapDbCollectionToCollection)
      .sort(
        (a, b) =>
          a.receivedAt.localeCompare(b.receivedAt) || a.createdAt.localeCompare(b.createdAt),
      );
  }


  async voidCollection(id: string, voidedBy: string, reason: string | null): Promise<Collection> {
    const existing = await repository.findById(id);
    if (!existing) throw new Error(i18n.t('errors.collection_not_found'));
    if (existing.voided_at) throw new Error(i18n.t('errors.collection_already_voided'));
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

const EPSILON = 1e-6;

export const collectionService = new CollectionService();
