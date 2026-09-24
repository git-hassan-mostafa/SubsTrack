import type {
  Currency,
  Customer,
  UnpaidStartRule,
  WhatsAppAccount,
  WhatsAppLanguage,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppOptOut,
  WhatsAppQueueResult,
  WhatsAppRecipient,
  WhatsAppSkipReason,
  WhatsAppTemplate,
  WhatsAppTemplatePurpose,
} from "@/src/core/types";
import { newId } from "@/src/core/offline/ids";
import skippedMonthService from "@/src/modules/customer/customer-payments/services/SkippedMonthService";
import { ledgerService } from "@/src/modules/ledger/services/LedgerService";
import {
  RECIPIENTS_PER_REQUEST,
  renderTemplate,
} from "@/supabase/functions/_shared/whatsapp/rules";
import {
  sijilTemplateByPurpose,
  type SijilTemplatePurpose,
} from "@/supabase/functions/_shared/whatsapp/sijilTemplates";
import repository from "../repository/WhatsAppRepository";
import type { SignupCompletion, SignupResult } from "../repository/IWhatsAppRepository";
import {
  mapDbWhatsAppAccount,
  mapDbWhatsAppMessage,
  mapDbWhatsAppOptOut,
  mapDbWhatsAppTemplate,
} from "../utils/mapper";
import { reminderFacts } from "../utils/reminderFacts";
import {
  defaultChoices,
  needsOwedFacts,
  resolveValues,
  type PlaceholderChoices,
} from "../utils/templateValues";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface WhatsAppOverview {
  account: WhatsAppAccount | null;
  templates: WhatsAppTemplate[];
  optOuts: WhatsAppOptOut[];
}

export interface RecipientBuild {
  recipients: WhatsAppRecipient[];
  skipped: { customerId: string; reason: WhatsAppSkipReason }[];
}

export interface RecipientBuildArgs {
  customers: Customer[];
  choices: PlaceholderChoices;
  businessName: string;
  optedOutCustomerIds: Set<string>;
  currencies: Currency[];
  unpaidRule: UnpaidStartRule;
  t: TFn;
}

class WhatsAppService {
  async getOverview(tenantId: string): Promise<WhatsAppOverview> {
    const [accountRow, optOutRows] = await Promise.all([
      repository.findLiveAccount(tenantId),
      repository.findOptOuts(tenantId),
    ]);
    const account = accountRow ? mapDbWhatsAppAccount(accountRow) : null;
    const templates = account
      ? (await repository.findTemplates(account.id)).map(mapDbWhatsAppTemplate)
      : [];
    return { account, templates, optOuts: optOutRows.map(mapDbWhatsAppOptOut) };
  }

  async getMessages(
    tenantId: string,
    status: WhatsAppMessageStatus | null,
    offset: number,
    limit: number,
  ): Promise<WhatsAppMessage[]> {
    const rows = await repository.findMessages(tenantId, { status, offset, limit });
    return rows.map(mapDbWhatsAppMessage);
  }

  async startConnect(consent: boolean): Promise<string> {
    const { url } = await repository.startConnect(consent);
    return url;
  }

  refresh(): Promise<void> {
    return repository.refresh();
  }

  submitTemplates(): Promise<number> {
    return repository.submitTemplates();
  }

  disconnect(): Promise<void> {
    return repository.disconnect();
  }

  setOptOut(customerId: string, optedOut: boolean): Promise<void> {
    return repository.setOptOut(customerId, optedOut);
  }

  cancelBatch(batchId: string): Promise<void> {
    return repository.cancelBatch(batchId);
  }

  completeSignup(input: SignupCompletion): Promise<SignupResult> {
    return repository.completeSignup(input);
  }

  registerPin(s: string, pin: string): Promise<SignupResult> {
    return repository.registerPin(s, pin);
  }

  isReady(account: WhatsAppAccount | null): boolean {
    return account?.status === "connected";
  }

  isApproved(template: WhatsAppTemplate): boolean {
    return template.status === "APPROVED" && template.supported;
  }

  // Sijil templates only in the tenant language; the tenant's own as they are.
  sendableTemplates(
    templates: WhatsAppTemplate[],
    language: WhatsAppLanguage,
  ): WhatsAppTemplate[] {
    return templates.filter(
      (t) => this.isApproved(t) && (!t.isSijil || t.language === language),
    );
  }

  templateForPurpose(
    templates: WhatsAppTemplate[],
    purpose: WhatsAppTemplatePurpose,
    language: WhatsAppLanguage,
  ): WhatsAppTemplate | null {
    return (
      templates.find(
        (t) =>
          t.isSijil &&
          t.purpose === purpose &&
          t.language === language &&
          this.isApproved(t),
      ) ?? null
    );
  }

  optedOutCustomerIds(optOuts: WhatsAppOptOut[]): Set<string> {
    return new Set(
      optOuts.map((o) => o.customerId).filter((id): id is string => !!id),
    );
  }

  // Amounts come from the ledger's own merge; the server re-checks recipients.
  async buildRecipients(args: RecipientBuildArgs): Promise<RecipientBuild> {
    const skipped: RecipientBuild["skipped"] = [];
    const reachable = args.customers.filter((customer) => {
      if (!customer.phoneNumber?.trim()) {
        skipped.push({ customerId: customer.id, reason: "no_phone" });
        return false;
      }
      if (args.optedOutCustomerIds.has(customer.id)) {
        skipped.push({ customerId: customer.id, reason: "opted_out" });
        return false;
      }
      return true;
    });

    const wantsOwed = needsOwedFacts(args.choices);
    const owed = wantsOwed
      ? await ledgerService.getOwedForCustomers({
          customers: reachable,
          skips: await skippedMonthService.getActiveSkips(),
          unpaidRule: args.unpaidRule,
          currencies: args.currencies,
        })
      : null;

    const recipients: WhatsAppRecipient[] = [];
    for (const customer of reachable) {
      const facts = owed
        ? reminderFacts(owed.get(customer.id) ?? [], args.currencies, args.t)
        : null;
      if (wantsOwed && !facts) {
        skipped.push({ customerId: customer.id, reason: "nothing_owed" });
        continue;
      }
      const values = resolveValues(args.choices, {
        customerName: customer.name,
        businessName: args.businessName,
        facts,
      });
      if (!values) {
        skipped.push({ customerId: customer.id, reason: "missing_values" });
        continue;
      }
      recipients.push({ customerId: customer.id, values });
    }
    return { recipients, skipped };
  }

  // One request id per send, so a retried chunk never queues a customer twice.
  async queue(
    template: WhatsAppTemplate,
    recipients: WhatsAppRecipient[],
    force: boolean,
  ): Promise<WhatsAppQueueResult> {
    const requestId = newId();
    const result: WhatsAppQueueResult = { batchId: requestId, queued: 0, skipped: [] };
    for (let i = 0; i < recipients.length; i += RECIPIENTS_PER_REQUEST) {
      const chunk = await repository.queue({
        requestId,
        templateId: template.id,
        recipients: recipients.slice(i, i + RECIPIENTS_PER_REQUEST),
        force,
      });
      result.queued += chunk.queued;
      result.skipped.push(...chunk.skipped);
    }
    return result;
  }

  async reminderFallbackText(
    args: Omit<RecipientBuildArgs, "choices">,
    language: WhatsAppLanguage,
  ): Promise<{ text: string | null; reason: WhatsAppSkipReason | null }> {
    const spec = sijilTemplateByPurpose("payment_reminder");
    const { recipients, skipped } = await this.buildRecipients({
      ...args,
      choices: defaultChoices({ params: spec.params }),
    });
    const first = recipients[0];
    if (!first) return { text: null, reason: skipped[0]?.reason ?? "missing_values" };
    return {
      text: this.fallbackText("payment_reminder", language, first.values),
      reason: null,
    };
  }

  // The wa.me fallback reuses the Sijil template wording, in the tenant language.
  fallbackText(
    purpose: SijilTemplatePurpose,
    language: WhatsAppLanguage,
    values: Record<string, string>,
  ): string {
    return renderTemplate(sijilTemplateByPurpose(purpose).body[language], values);
  }

}

export const whatsAppService = new WhatsAppService();
