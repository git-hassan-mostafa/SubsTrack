import type { BranchFilter } from '@/src/core/constants';
import i18n from '@/src/core/i18n';
import type {
  Charge,
  CustomerDebts,
  DebtsView,
  MonthBill,
  OpenItem,
} from '@/src/core/types';
import { deterministicId, newId, nowIso } from '@/src/core/offline/ids';
import repository from '../repository/ChargeRepository';
import collectionRepository from '../repository/CollectionRepository';
import { mapDbChargeToCharge } from '../utils/mapper';
import { chargeLabel, isDebtItem, openItemFromCharge } from '../utils/openItems';

export interface CreateManualChargeInput {
  tenantId: string;
  customerId: string;
  branchId: string | null;
  description: string;
  amount: number;
  currencyId: string | null;
  ratePerUsdSnapshot: number;
  dueDate: string;
  recordedByUserId: string | null;
  notes?: string | null;
}

/**
 * Bills: raising them, correcting them, and answering "what does this customer
 * owe?". Money is CollectionService's job — the split is the whole point of the
 * model, so no method here ever touches an amount received.
 */
class ChargeService {
  // ── Ids ───────────────────────────────────────────────────────────────────

  /**
   * A month bill's id is derived from its natural key, so two devices
   * collecting the same month offline produce the SAME row and converge on sync
   * instead of billing the customer twice.
   */
  monthChargeId(customerPlanId: string, billingMonth: string): Promise<string> {
    return deterministicId(customerPlanId, billingMonth);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<Charge | null> {
    const row = await repository.findById(id);
    return row ? mapDbChargeToCharge(row) : null;
  }

  /**
   * The month bills for a set of service lines, paired with what has reached
   * them — the ONLY shape `buildMonthGrid` accepts.
   */
  async getMonthBillsForLines(customerPlanIds: string[]): Promise<Map<string, MonthBill[]>> {
    const charges = await repository.findMonthChargesForLines(customerPlanIds);
    const paid = await this.paidByCharge(charges.map((c) => c.id));
    const byLine = new Map<string, MonthBill[]>();
    for (const row of charges) {
      const charge = mapDbChargeToCharge(row);
      const bill: MonthBill = { charge, collected: paid.get(charge.id) ?? 0 };
      const key = charge.customerPlanId!;
      const list = byLine.get(key);
      if (list) list.push(bill);
      else byLine.set(key, [bill]);
    }
    return byLine;
  }

  async getMonthBillsForCustomer(customerId: string): Promise<MonthBill[]> {
    const charges = await repository.findMonthChargesForCustomer(customerId);
    const paid = await this.paidByCharge(charges.map((c) => c.id));
    return charges.map((row) => {
      const charge = mapDbChargeToCharge(row);
      return { charge, collected: paid.get(charge.id) ?? 0 };
    });
  }

  /** How much has reached each of these bills. Missing id = nothing collected. */
  async paidByCharge(chargeIds: string[]): Promise<Map<string, number>> {
    const balances = await repository.balances(chargeIds);
    return new Map(balances.map((b) => [b.id, b.paid]));
  }

  /**
   * Every STORED bill a customer still owes on, as OpenItems. Virtual unpaid
   * months are added by LedgerService, which is the only place that can build
   * them (it needs the month grid).
   */
  async getOpenCharges(opts: {
    customerId?: string;
    customerIds?: string[];
    branchFilter?: BranchFilter;
  }): Promise<OpenItem[]> {
    const charges = await repository.find({ ...opts, openOnly: false });
    const balances = await repository.balances(charges.map((c) => c.id));
    const byId = new Map(balances.map((b) => [b.id, b]));
    const items: OpenItem[] = [];
    for (const row of charges) {
      const bal = byId.get(row.id);
      if (!bal || bal.balance <= 0) continue;
      items.push(openItemFromCharge(mapDbChargeToCharge(row), bal.paid, chargeLabel(row)));
    }
    return items;
  }

  /**
   * The Debts screen. ONE query over one table — no category merging, no
   * `gross − payments` subtraction, and every row already carries its own
   * balance, so the parts add up to the total exactly.
   *
   * `unpaidMonths` arrives from LedgerService: a fully unpaid month is owed but
   * is NOT a debt (it is red in the grid), so it is kept beside the debts rather
   * than inside them.
   */
  buildDebtsView(open: OpenItem[]): DebtsView {
    const byCustomer = new Map<string, CustomerDebts>();
    for (const item of open) {
      let entry = byCustomer.get(item.customerId);
      if (!entry) {
        entry = {
          customerId: item.customerId,
          customerName: item.customerName,
          items: [],
          unpaidMonths: [],
          debtUsd: 0,
          unpaidMonthsUsd: 0,
          oldestDaysLate: 0,
        };
        byCustomer.set(item.customerId, entry);
      }
      const usd = item.balance / item.ratePerUsdSnapshot;
      if (item.isDebt) {
        entry.items.push(item);
        entry.debtUsd += usd;
      } else {
        entry.unpaidMonths.push(item);
        entry.unpaidMonthsUsd += usd;
      }
    }

    const today = new Date();
    const customers: CustomerDebts[] = [];
    let monthsUsd = 0;
    let salesUsd = 0;
    let manualUsd = 0;
    for (const entry of byCustomer.values()) {
      // A customer with only plain unpaid months is not a debtor — the grid
      // already shows him as overdue.
      if (entry.items.length === 0) continue;
      entry.items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      entry.unpaidMonths.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      entry.oldestDaysLate = daysLate(entry.items[0].dueDate, today);
      for (const i of entry.items) {
        const usd = i.balance / i.ratePerUsdSnapshot;
        if (i.kind === 'month') monthsUsd += usd;
        else if (i.kind === 'sale') salesUsd += usd;
        else manualUsd += usd;
      }
      customers.push(entry);
    }
    customers.sort((a, b) => b.oldestDaysLate - a.oldestDaysLate || b.debtUsd - a.debtUsd);

    return {
      customers,
      summary: {
        totalUsd: monthsUsd + salesUsd + manualUsd,
        monthsUsd,
        salesUsd,
        manualUsd,
        customerCount: customers.length,
        writtenOffUsd: 0,
      },
    };
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /** A hand-typed debt: an installation fee, a penalty, anything with no record. */
  async addManualCharge(input: CreateManualChargeInput): Promise<Charge> {
    this.validateAmount(input.amount);
    if (!input.customerId) throw new Error(i18n.t('errors.debt_customer_required'));
    if (!input.description?.trim()) throw new Error(i18n.t('errors.debt_description_required'));
    if (!(input.ratePerUsdSnapshot > 0)) throw new Error(i18n.t('errors.rate_snapshot_positive'));

    const now = nowIso();
    const row = await repository.create({
      id: newId(),
      tenant_id: input.tenantId,
      branch_id: input.branchId,
      customer_id: input.customerId,
      kind: 'manual',
      customer_plan_id: null,
      billing_month: null,
      duration_months: 1,
      plan_id: null,
      sale_id: null,
      description: input.description.trim(),
      amount: input.amount,
      currency_id: input.currencyId,
      rate_per_usd_snapshot: input.ratePerUsdSnapshot,
      issued_at: now,
      due_date: input.dueDate,
      recorded_by_user_id: input.recordedByUserId,
      notes: input.notes ?? null,
    });
    return mapDbChargeToCharge(row);
  }

  async updateManualCharge(
    id: string,
    values: { description?: string; amount?: number; dueDate?: string; notes?: string | null },
  ): Promise<Charge> {
    if (values.amount !== undefined) this.validateAmount(values.amount);
    const row = await repository.update(id, {
      ...(values.description !== undefined ? { description: values.description.trim() } : {}),
      ...(values.amount !== undefined ? { amount: values.amount } : {}),
      ...(values.dueDate !== undefined ? { due_date: values.dueDate } : {}),
      ...(values.notes !== undefined ? { notes: values.notes } : {}),
    });
    return mapDbChargeToCharge(row);
  }

  /**
   * The bill was a MISTAKE. Refused once money sits on it — otherwise the cash
   * would point at a bill that no longer exists. Void the collection first, or
   * write the bill off.
   */
  async voidCharge(id: string, voidedBy: string, reason: string | null): Promise<Charge> {
    const [balance] = await repository.balances([id]);
    if (balance && balance.paid > 0) throw new Error(i18n.t('errors.charge_void_has_money'));
    const row = await repository.void(id, voidedBy, reason);
    return mapDbChargeToCharge(row);
  }

  /**
   * The bill is REAL but will never be paid. Leaves "still owed" and is reported
   * as a loss — the opposite statement to a void, which claims it never existed.
   */
  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<Charge> {
    const charge = await repository.findById(id);
    if (!charge) throw new Error(i18n.t('errors.charge_not_found'));
    if (charge.voided_at) throw new Error(i18n.t('errors.charge_voided'));
    if (charge.written_off_at) throw new Error(i18n.t('errors.charge_already_written_off'));
    const row = await repository.writeOff(id, writtenOffBy, reason);
    return mapDbChargeToCharge(row);
  }

  /** Money given up on in a window — the Reports "lost to unpaid debts" line. */
  async writtenOffUsdInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<number> {
    const rows = await repository.writtenOffInRange(startIso, endExclusiveIso, branchFilter);
    if (rows.length === 0) return 0;
    // Only the part never collected is a loss — a bill written off after a
    // partial payment lost only its remainder.
    const balances = await collectionRepository.findItemsForCharges(rows.map((r) => r.id));
    const paidBy = new Map<string, number>();
    for (const it of balances) {
      paidBy.set(it.charge_id, (paidBy.get(it.charge_id) ?? 0) + it.amount);
    }
    return rows.reduce(
      (sum, r) => sum + Math.max(0, r.amount - (paidBy.get(r.id) ?? 0)) / r.rate_per_usd_snapshot,
      0,
    );
  }

  private validateAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(i18n.t('errors.debt_amount_positive'));
    }
  }
}

/** Whole days past a due date, floored at 0. */
function daysLate(dueDate: string, today: Date): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const diff = today.getTime() - due.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 86_400_000);
}

export const chargeService = new ChargeService();
export { isDebtItem };
