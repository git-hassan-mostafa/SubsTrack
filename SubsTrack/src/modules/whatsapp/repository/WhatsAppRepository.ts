import { Platform } from "react-native";
import type { WhatsAppQueueResult } from "@/src/core/types";
import type {
  DbWhatsAppAccount,
  DbWhatsAppMessage,
  DbWhatsAppOptOut,
  DbWhatsAppTemplate,
} from "@/src/core/types/db";
import { BaseRepository } from "@/src/core/utils/BaseRepository";
import { readFunctionsErrorBody } from "@/src/core/utils/functionsError";
import { WHATSAPP_FUNCTIONS } from "../utils/constants";
import { WhatsAppError } from "../utils/whatsappError";
import type {
  IWhatsAppRepository,
  MessagePageQuery,
  QueueInput,
  SignupCompletion,
  SignupResult,
} from "./IWhatsAppRepository";
import { OfflineWhatsAppRepository } from "./WhatsAppRepository.offline";

const ACCOUNT_COLUMNS =
  "id, tenant_id, waba_id, phone_number_id, display_phone_number, verified_name, is_coexistence, status, attention_code, quality_rating, messaging_limit_tier, name_status, consent_confirmed_at, connected_at";

const TEMPLATE_COLUMNS =
  "id, name, language, category, status, rejection_reason, parameter_format, body_text, params, purpose, is_sijil, supported";

const MESSAGE_COLUMNS =
  "id, customer_id, batch_id, template_name, purpose, status, error_key, error_code, error_title, created_at, delivered_at, read_at, failed_at, customers(name)";

// Reads go through RLS; every write goes through an Edge Function.
export class WhatsAppRepository
  extends BaseRepository
  implements IWhatsAppRepository
{
  async findLiveAccount(tenantId: string): Promise<DbWhatsAppAccount | null> {
    const { data, error } = await this.db
      .from("whatsapp_accounts")
      .select(ACCOUNT_COLUMNS)
      .eq("tenant_id", tenantId)
      .neq("status", "disconnected")
      .maybeSingle();
    if (error) this.handleError(error);
    return (data as DbWhatsAppAccount | null) ?? null;
  }

  async findTemplates(accountId: string): Promise<DbWhatsAppTemplate[]> {
    const { data, error } = await this.db
      .from("whatsapp_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("account_id", accountId)
      .neq("status", "DELETED")
      .order("name");
    if (error) this.handleError(error);
    return (data ?? []) as DbWhatsAppTemplate[];
  }

  async findOptOuts(tenantId: string): Promise<DbWhatsAppOptOut[]> {
    const { data, error } = await this.db
      .from("whatsapp_opt_outs")
      .select("id, customer_id, phone_e164, source, created_at")
      .eq("tenant_id", tenantId)
      .is("cleared_at", null);
    if (error) this.handleError(error);
    return (data ?? []) as DbWhatsAppOptOut[];
  }

  async findMessages(
    tenantId: string,
    query: MessagePageQuery,
  ): Promise<DbWhatsAppMessage[]> {
    let request = this.db
      .from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) request = request.eq("status", query.status);
    const { data, error } = await request;
    if (error) this.handleError(error);
    return (data ?? []) as unknown as DbWhatsAppMessage[];
  }

  async startConnect(consent: boolean): Promise<{ url: string }> {
    return this.invokeAsStaff(WHATSAPP_FUNCTIONS.admin, {
      action: "start_connect",
      consent,
    });
  }

  async refresh(): Promise<void> {
    await this.invokeAsStaff(WHATSAPP_FUNCTIONS.admin, { action: "refresh" });
  }

  async submitTemplates(): Promise<number> {
    const result = await this.invokeAsStaff<{ submitted: number }>(
      WHATSAPP_FUNCTIONS.admin,
      { action: "submit_templates" },
    );
    return result?.submitted ?? 0;
  }

  async disconnect(): Promise<void> {
    await this.invokeAsStaff(WHATSAPP_FUNCTIONS.admin, {
      action: "disconnect",
    });
  }

  async setOptOut(customerId: string, optedOut: boolean): Promise<void> {
    await this.invokeAsStaff(WHATSAPP_FUNCTIONS.admin, {
      action: "set_opt_out",
      customerId,
      optedOut,
    });
  }

  async queue(input: QueueInput): Promise<WhatsAppQueueResult> {
    return this.invokeAsStaff(WHATSAPP_FUNCTIONS.send, {
      action: "queue",
      ...input,
    });
  }

  async cancelBatch(batchId: string): Promise<void> {
    await this.invokeAsStaff(WHATSAPP_FUNCTIONS.send, {
      action: "cancel_batch",
      batchId,
    });
  }

  async completeSignup(input: SignupCompletion): Promise<SignupResult> {
    return this.invoke(WHATSAPP_FUNCTIONS.onboard, {
      action: "complete",
      ...input,
    });
  }

  async registerPin(s: string, pin: string): Promise<SignupResult> {
    return this.invoke(WHATSAPP_FUNCTIONS.onboard, {
      action: "register_pin",
      s,
      pin,
    });
  }

  private async invokeAsStaff<T>(name: string, body: object): Promise<T> {
    await this.ensureFreshSession();
    return this.invoke<T>(name, body);
  }

  private async invoke<T>(name: string, body: object): Promise<T> {
    const { data, error } = await this.db.functions.invoke<T>(name, { body });
    if (error) {
      const parsed = await readFunctionsErrorBody(error);
      if (parsed?.code) {
        throw new WhatsAppError(parsed.code, parsed.error ?? error.message);
      }
      await this.handleFunctionsError(error);
    }
    return data as T;
  }
}

const impl: IWhatsAppRepository =
  Platform.OS === "web"
    ? new WhatsAppRepository()
    : new OfflineWhatsAppRepository();

export default impl;
