import type {
  Charge,
  Collection,
  Currency,
  Customer,
  CustomerPlan,
  CustomerStatus,
  MonthBill,
  MonthEntry,
  OpenItem,
  Sale,
  SkippedMonth,
  UnpaidStartRule,
} from "@shared/core/types";
import { mapDbCustomerToCustomer } from "@shared/modules/customer/customers/utils/mapper";
import { mapDbCustomerPlanToCustomerPlan } from "@shared/modules/customer/customer-plans/utils/mapper";
import {
  mapDbChargeToCharge,
  mapDbCollectionToCollection,
} from "@shared/modules/ledger/utils/mapper";
import { mapDbSaleToSale } from "@shared/modules/transaction/sales/utils/mapper";
import { mapDbSkippedMonthToSkippedMonth } from "@shared/modules/customer/customer-payments/utils/mapper";
import { mapDbCurrencyToCurrency } from "@shared/modules/admin/currencies/utils/mapper";
import { DEFAULT_UNPAID_START_RULE } from "@shared/modules/admin/tenant-settings/utils/constants";
import {
  buildMonthGrid,
  buildCustomerStatus,
} from "@shared/modules/customer/customer-payments/utils/monthStatus";
import { mergeOwed } from "@shared/modules/ledger/utils/mergeOwed";
import { openItemFromCharge, chargeLabel } from "@shared/modules/ledger/utils/openItems";
import type { PortalPayload } from "../repository/PortalRepository";

// What the whole portal renders from. Everything here is produced by
// SubsTrack's own functions - this file wires them together, it decides nothing.
export interface PortalModel {
  orgName: string;
  branchName: string | null;
  customer: Customer;
  lines: CustomerPlan[];
  bills: MonthBill[];
  owed: OpenItem[];
  collections: Collection[];
  sales: Sale[];
  skips: SkippedMonth[];
  currencies: Currency[];
  chargesById: Map<string, Charge>;
  chargeLabels: Map<string, string>;
  collectorNames: Map<string, string>;
  status: CustomerStatus;
  unpaidRule: UnpaidStartRule;
  displayCurrencyId: string | null;
}

export function buildPortalModel(payload: PortalPayload): PortalModel {
  const customer = mapDbCustomerToCustomer(payload.customer);
  const lines = payload.lines.map(mapDbCustomerPlanToCustomerPlan);
  const skips = payload.skips.map(mapDbSkippedMonthToSkippedMonth);
  const currencies = payload.currencies.map(mapDbCurrencyToCurrency);
  const collections = payload.collections.map(mapDbCollectionToCollection);
  const sales = payload.sales.map(mapDbSaleToSale);

  const paidOf = (id: string) => payload.paidByCharge[id] ?? 0;
  const charges = payload.charges.map(mapDbChargeToCharge);
  const chargesById = new Map(charges.map((c) => [c.id, c]));

  const unpaidRule = parseUnpaidRule(payload.settings.UnpaidStartRule);

  // A month bill is a charge PAIRED with how much money reached it - the only
  // shape buildMonthGrid accepts. `collected` is what decides a month's colour,
  // never the existence of the row (gotcha #106).
  const bills: MonthBill[] = charges
    .filter((c) => c.kind === "month")
    .map((charge) => ({ charge, collected: paidOf(charge.id) }));

  const billsByLine = new Map<string, MonthBill[]>();
  for (const bill of bills) {
    const lineId = bill.charge.customerPlanId;
    if (!lineId) continue;
    const list = billsByLine.get(lineId) ?? [];
    list.push(bill);
    billsByLine.set(lineId, list);
  }

  // Stored bills that still carry a balance. Written-off ones are dropped here:
  // the write-off is the business giving up on the remainder, so it is not
  // something to ask the customer for - but the money that DID reach it stays
  // visible in the payment history (gotchas #115, #152).
  const stored: OpenItem[] = charges
    .filter(
      (c) =>
        !c.writtenOffAt && c.amount - paidOf(c.id) > 0.00000001,
    )
    .map((charge) =>
      openItemFromCharge(
        charge,
        paidOf(charge.id),
        chargeLabelFor(charge, payload),
        customer.name,
      ),
    );

  const owed = mergeOwed({
    customer,
    lines,
    skips,
    unpaidRule,
    currencies,
    stored,
    billsByLine,
    withOpenMonths: true,
  });

  return {
    orgName: payload.org.name,
    branchName: payload.branch?.name ?? null,
    customer,
    lines,
    bills,
    owed,
    collections,
    sales,
    skips,
    currencies,
    chargesById,
    chargeLabels: new Map(
      payload.charges.map((row) => [row.id, chargeLabel(row)]),
    ),
    collectorNames: new Map(
      payload.collectors.map((u) => [u.id, u.full_name]),
    ),
    status: buildCustomerStatus(lines, bills, skips, unpaidRule),
    unpaidRule,
    displayCurrencyId: payload.settings.DisplayCurrencyId || null,
  };
}

// The grid for one year across every line. The read is NOT year-scoped, so
// changing year re-derives from rows already in memory (gotcha #121).
export function buildGrids(
  model: PortalModel,
  year: number,
): { line: CustomerPlan; entries: MonthEntry[] }[] {
  return model.lines
    .filter((line) => line.active)
    .map((line) => ({
      line,
      entries: buildMonthGrid(
        line,
        model.bills.filter((b) => b.charge.customerPlanId === line.id),
        model.skips.filter((s) => s.customerPlanId === line.id),
        year,
        model.unpaidRule,
      ),
    }));
}


function parseUnpaidRule(value: string | null | undefined): UnpaidStartRule {
  return value === "customer_start_day" || value === "month_start"
    ? value
    : DEFAULT_UNPAID_START_RULE;
}

// chargeLabel reads the raw row because a sale bill's name lives on the joined
// sale. The portal's charges arrive without that join, so a sale bill falls
// back to its receipt number, which is how a sale is identified everywhere.
function chargeLabelFor(charge: Charge, payload: PortalPayload): string {
  const row = payload.charges.find((c) => c.id === charge.id);
  return row ? chargeLabel(row) : "";
}

export { openItemFromCharge, chargeLabel };
