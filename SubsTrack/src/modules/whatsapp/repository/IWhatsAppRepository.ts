import type {
  WhatsAppMessageStatus,
  WhatsAppQueueResult,
  WhatsAppRecipient,
} from "@/src/core/types";
import type {
  DbWhatsAppAccount,
  DbWhatsAppMessage,
  DbWhatsAppOptOut,
  DbWhatsAppTemplate,
} from "@/src/core/types/db";

export interface QueueInput {
  requestId: string;
  templateId: string;
  recipients: WhatsAppRecipient[];
  force: boolean;
}

export interface MessagePageQuery {
  status: WhatsAppMessageStatus | null;
  offset: number;
  limit: number;
}

export interface SignupCompletion {
  s: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  flow: "cloud" | "coexistence";
}

export interface SignupResult {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

export interface IWhatsAppRepository {
  findLiveAccount(tenantId: string): Promise<DbWhatsAppAccount | null>;
  findTemplates(accountId: string): Promise<DbWhatsAppTemplate[]>;
  findOptOuts(tenantId: string): Promise<DbWhatsAppOptOut[]>;
  findMessages(
    tenantId: string,
    query: MessagePageQuery,
  ): Promise<DbWhatsAppMessage[]>;
  startConnect(consent: boolean): Promise<{ url: string }>;
  refresh(): Promise<void>;
  submitTemplates(): Promise<number>;
  disconnect(): Promise<void>;
  setOptOut(customerId: string, optedOut: boolean): Promise<void>;
  queue(input: QueueInput): Promise<WhatsAppQueueResult>;
  cancelBatch(batchId: string): Promise<void>;
  completeSignup(input: SignupCompletion): Promise<SignupResult>;
  registerPin(s: string, pin: string): Promise<SignupResult>;
}
