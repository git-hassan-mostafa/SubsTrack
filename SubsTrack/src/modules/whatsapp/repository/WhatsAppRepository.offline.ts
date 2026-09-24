import type { WhatsAppQueueResult } from "@/src/core/types";
import type {
  DbWhatsAppAccount,
  DbWhatsAppMessage,
  DbWhatsAppOptOut,
  DbWhatsAppTemplate,
} from "@/src/core/types/db";
import { RequiresConnectionError } from "@/src/core/offline/errors";
import { isOnline } from "@/src/core/offline/net/connectivity";
import type {
  IWhatsAppRepository,
  MessagePageQuery,
  QueueInput,
  SignupCompletion,
  SignupResult,
} from "./IWhatsAppRepository";
import { WhatsAppRepository } from "./WhatsAppRepository";

// Online-only: WhatsApp tables are never mirrored (docs/offline.md).
export class OfflineWhatsAppRepository implements IWhatsAppRepository {
  private online = new WhatsAppRepository();

  private async requireOnline(): Promise<void> {
    if (!(await isOnline())) throw new RequiresConnectionError();
  }

  async findLiveAccount(tenantId: string): Promise<DbWhatsAppAccount | null> {
    await this.requireOnline();
    return this.online.findLiveAccount(tenantId);
  }

  async findTemplates(accountId: string): Promise<DbWhatsAppTemplate[]> {
    await this.requireOnline();
    return this.online.findTemplates(accountId);
  }

  async findOptOuts(tenantId: string): Promise<DbWhatsAppOptOut[]> {
    await this.requireOnline();
    return this.online.findOptOuts(tenantId);
  }

  async findMessages(
    tenantId: string,
    query: MessagePageQuery,
  ): Promise<DbWhatsAppMessage[]> {
    await this.requireOnline();
    return this.online.findMessages(tenantId, query);
  }

  async startConnect(consent: boolean): Promise<{ url: string }> {
    await this.requireOnline();
    return this.online.startConnect(consent);
  }

  async refresh(): Promise<void> {
    await this.requireOnline();
    return this.online.refresh();
  }

  async submitTemplates(): Promise<number> {
    await this.requireOnline();
    return this.online.submitTemplates();
  }

  async disconnect(): Promise<void> {
    await this.requireOnline();
    return this.online.disconnect();
  }

  async setOptOut(customerId: string, optedOut: boolean): Promise<void> {
    await this.requireOnline();
    return this.online.setOptOut(customerId, optedOut);
  }

  async queue(input: QueueInput): Promise<WhatsAppQueueResult> {
    await this.requireOnline();
    return this.online.queue(input);
  }

  async cancelBatch(batchId: string): Promise<void> {
    await this.requireOnline();
    return this.online.cancelBatch(batchId);
  }

  async completeSignup(input: SignupCompletion): Promise<SignupResult> {
    await this.requireOnline();
    return this.online.completeSignup(input);
  }

  async registerPin(s: string, pin: string): Promise<SignupResult> {
    await this.requireOnline();
    return this.online.registerPin(s, pin);
  }
}
