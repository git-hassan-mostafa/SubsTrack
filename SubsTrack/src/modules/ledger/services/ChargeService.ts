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
import { daysLate } from '@/src/core/utils/date';
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

  monthChargeId(customerPlanId: string, billingMonth: string): Promise<string> {
    return deterministicId(customerPlanId, billingMonth);
  }


  async getById(id: string): Promise<Charge | null> {
    const row = await repository.findById(id);
    return row ? mapDbChargeToCharge(row) : null;
  }

  async getMonthBillsForLines(customerPlanIds: string[]): Promise<Map<string, MonthBill[]>> {
    const rows = await repository.findMonthChargesForLines(customerPlanIds);
    const byLine = new Map<string, MonthBill[]>();
    for (const { charge: row, paid } of rows) {
      const charge = mapDbChargeToCharge(row);
      const bill: MonthBill = { charge, collected: paid };
      const key = charge.customerPlanId!;
      const list = byLine.get(key);
      if (list) list.push(bill);
      else byLine.set(key, [bill]);
    }
    return byLine;
  }

  async getMonthBillsForCustomer(customerId: string): Promise<MonthBill[]> {
    const rows = await repository.findMonthChargesForCustomer(customerId);
    return rows.map(({ charge, paid }) => ({
      charge: mapDbChargeToCharge(charge),
      collected: paid,
    }));
  }

  async getOpenCharges(opts: {
    customerId?: string;
    customerIds?: string[];
    branchFilter?: BranchFilter;
  }): Promise<OpenItem[]> {
    const open = await repository.findOpenWithPaid(opts);
    return open.map(({ charge, paid }) =>
      openItemFromCharge(
        mapDbChargeToCharge(charge),
        paid,
        chargeLabel(charge),
        charge.customers?.name ?? '',
      ),
    );
  }

  buildDebtsView(open: OpenItem[]): DebtsView {
    const byCustomer = new Map<string, CustomerDebts>();
    for (const item of open) {
      if (item.kind === 'month' && item.paid <= 0) continue;
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
    const existing = await repository.findById(id);
    if (!existing) throw new Error(i18n.t('errors.charge_not_found'));
    if (existing.voided_at || existing.written_off_at) {
      throw new Error(i18n.t('errors.charge_not_editable'));
    }
    if (values.amount !== undefined) {
      const [balance] = await repository.balances([id]);
      if (balance && values.amount + EPSILON < balance.paid) {
        throw new Error(i18n.t('errors.charge_amount_below_collected'));
      }
    }
    const row = await repository.update(id, {
      ...(values.description !== undefined ? { description: values.description.trim() } : {}),
      ...(values.amount !== undefined ? { amount: values.amount } : {}),
      ...(values.dueDate !== undefined ? { due_date: values.dueDate } : {}),
      ...(values.notes !== undefined ? { notes: values.notes } : {}),
    });
    return mapDbChargeToCharge(row);
  }

  async voidCharge(id: string, voidedBy: string, reason: string | null): Promise<Charge> {
    const [balance] = await repository.balances([id]);
    if (balance && balance.paid > 0) throw new Error(i18n.t('errors.charge_void_has_money'));
    const row = await repository.void(id, voidedBy, reason);
    return mapDbChargeToCharge(row);
  }

  paymentIdsForCharge(chargeId: string): Promise<string[]> {
    return this.paymentIdsForCharges([chargeId]);
  }

  async paymentIdsForCharges(chargeIds: string[]): Promise<string[]> {
    if (chargeIds.length === 0) return [];
    const items = await collectionRepository.findItemsForCharges(chargeIds);
    return [...new Set(items.map((i) => i.collection_id))];
  }

  async voidChargeWithPayments(
    id: string,
    voidedBy: string,
    reason: string | null,
  ): Promise<Charge> {
    const paymentIds = await this.paymentIdsForCharge(id);
    if (paymentIds.length > 0) {
      await collectionRepository.voidMany(paymentIds, voidedBy, reason);
    }
    const row = await repository.void(id, voidedBy, reason);
    return mapDbChargeToCharge(row);
  }

  async writeOff(id: string, writtenOffBy: string, reason: string | null): Promise<Charge> {
    const charge = await repository.findById(id);
    if (!charge) throw new Error(i18n.t('errors.charge_not_found'));
    if (charge.voided_at) throw new Error(i18n.t('errors.charge_voided'));
    if (charge.written_off_at) throw new Error(i18n.t('errors.charge_already_written_off'));
    const row = await repository.writeOff(id, writtenOffBy, reason);
    return mapDbChargeToCharge(row);
  }

  async writtenOffUsdInRange(
    startIso: string,
    endExclusiveIso: string,
    branchFilter: BranchFilter,
  ): Promise<number> {
    const rows = await repository.writtenOffInRange(startIso, endExclusiveIso, branchFilter);
    if (rows.length === 0) return 0;
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

const EPSILON = 1e-6;

export const chargeService = new ChargeService();
export { isDebtItem };
