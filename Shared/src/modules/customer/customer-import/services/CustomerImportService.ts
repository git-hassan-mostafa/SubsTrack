import i18n from "@shared/core/i18n";
import { repositories } from "@shared/core/runtime/repositories";
import { inChunks } from "@shared/core/utils/chunk";
import { newId } from "@shared/core/utils/ids";
import billingService from "@shared/modules/admin/billing/services/BillingService";
import { QuotaExceededError } from "@shared/modules/admin/billing/utils/quotaError";
import type { QuotaPair } from "@shared/modules/admin/billing/utils/types";
import customerPlanService, {
  lineRowOf,
} from "@shared/modules/customer/customer-plans/services/CustomerPlanService";
import customerService, {
  newCustomerPayload,
} from "@shared/modules/customer/customers/services/CustomerService";
import type {
  ImportCustomerPayload,
  ImportLinePayload,
} from "@shared/modules/customer/customer-import/repository/ICustomerImportRepository";
import { buildImportPreview } from "@shared/modules/customer/customer-import/utils/importPreview";
import { phoneKey } from "@shared/modules/customer/customer-import/utils/importText";
import type {
  ImportCustomer,
  ImportCustomerResult,
  ImportLookups,
  ImportPreview,
  ImportRunResult,
} from "@shared/modules/customer/customer-import/utils/types";

export const IMPORT_GROUP_SIZE = 100;

export interface ImportProgress {
  done: number;
  total: number;
}

type PayloadGroup = {
  customers: ImportCustomer[];
  customerRows: ImportCustomerPayload[];
  lineRows: ImportLinePayload[];
};

function payloadGroupOf(customers: ImportCustomer[], tenantId: string): PayloadGroup {
  const customerRows: ImportCustomerPayload[] = [];
  const lineRows: ImportLinePayload[] = [];
  for (const customer of customers) {
    const id = newId();
    customerRows.push({ id, ...newCustomerPayload(customer.input, tenantId) });
    for (const line of customer.lines) {
      lineRows.push({ id: newId(), customer_id: id, tenant_id: tenantId, ...lineRowOf(line) });
    }
  }
  return { customers, customerRows, lineRows };
}

class CustomerImportService {
  // Every staff-typed phone, keyed the way the file's phones are compared.
  async getPhoneOwners(): Promise<Map<string, string>> {
    const owners = await repositories().customerImport.findPhoneOwners();
    const byKey = new Map<string, string>();
    for (const owner of owners) {
      const key = phoneKey(owner.phoneNumber);
      if (key && !byKey.has(key)) byKey.set(key, owner.name);
    }
    return byKey;
  }

  preview(fileName: string, sheet: readonly (readonly string[])[], lookups: ImportLookups): ImportPreview {
    return buildImportPreview(fileName, sheet, lookups, {
      customer: (input) => customerService.assertValidInput(input),
      lines: (lines) => customerPlanService.assertNewLinesValid(lines),
    });
  }

  // Live counts, the whole file at once — a file that does not fit imports nothing (#149).
  async assertFits(limits: QuotaPair, ready: readonly ImportCustomer[]): Promise<QuotaPair> {
    const [customers, plans] = await Promise.all([
      customerService.countActive(null),
      customerPlanService.countActive(),
    ]);
    const active = { customers, plans };
    billingService.assertQuotas(limits, active, {
      customers: customers + ready.length,
      plans: plans + ready.reduce((sum, c) => sum + c.lines.length, 0),
    });
    return active;
  }

  tooBigMessage(error: QuotaExceededError, ready: readonly ImportCustomer[]): string {
    const adding =
      error.kind === "customers" ? ready.length : ready.reduce((sum, c) => sum + c.lines.length, 0);
    return i18n.t(`customer_import.too_big_${error.kind}`, {
      adding,
      room: Math.max(0, error.limit - error.activeCount),
      count: error.activeCount,
      allowance: error.limit,
    });
  }

  // Groups run in order; the first failure stops the run, and a lost answer is looked up by id.
  async importCustomers(
    ready: readonly ImportCustomer[],
    tenantId: string,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportRunResult> {
    for (const customer of ready) {
      customerService.assertValidInput(customer.input);
      customerPlanService.assertNewLinesValid(customer.lines);
    }
    const byCustomer = new Map<string, ImportCustomerResult>();
    const groups = inChunks(ready, IMPORT_GROUP_SIZE).map((chunk) => payloadGroupOf(chunk, tenantId));
    let importedCustomers = 0;
    let importedLines = 0;
    let failure: string | null = null;
    onProgress({ done: 0, total: ready.length });

    for (const group of groups) {
      if (failure) {
        for (const customer of group.customers) {
          byCustomer.set(customer.key, { outcome: "not_run", reason: i18n.t("customer_import.reason.stopped") });
        }
        continue;
      }
      try {
        await repositories().customerImport.importGroup(group.customerRows, group.lineRows);
        for (const customer of group.customers) byCustomer.set(customer.key, { outcome: "imported", reason: null });
      } catch (e) {
        failure = (e as Error).message;
        const landed = await this.landedIds(group.customerRows.map((row) => row.id));
        group.customers.forEach((customer, i) => {
          byCustomer.set(customer.key, this.failedOutcome(landed, group.customerRows[i].id, failure ?? ""));
        });
        if (landed?.size === group.customers.length) failure = null;
      }
      const imported = group.customers.filter((c) => byCustomer.get(c.key)?.outcome === "imported");
      importedCustomers += imported.length;
      importedLines += imported.reduce((sum, c) => sum + c.lines.length, 0);
      onProgress({ done: importedCustomers, total: ready.length });
    }

    return { byCustomer, importedCustomers, importedLines, failure };
  }

  private async landedIds(ids: string[]): Promise<Set<string> | null> {
    try {
      return await repositories().customerImport.findExistingIds(ids);
    } catch {
      return null;
    }
  }

  private failedOutcome(landed: Set<string> | null, id: string, failure: string): ImportCustomerResult {
    if (landed === null) return { outcome: "unknown", reason: i18n.t("customer_import.reason.unknown") };
    if (landed.has(id)) return { outcome: "imported", reason: null };
    return { outcome: "failed", reason: failure };
  }
}

export const customerImportService = new CustomerImportService();
