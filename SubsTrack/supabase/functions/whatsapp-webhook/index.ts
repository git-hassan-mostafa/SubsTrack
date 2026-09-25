// @ts-nocheck — Deno runtime file.
import { markAttention, retireAccount } from "../_shared/whatsapp/accounts.ts";
import { serviceClient } from "../_shared/whatsapp/auth.ts";
import { hmacSha256Hex, timingSafeEqual } from "../_shared/whatsapp/crypto.ts";
import { createLogger, newRequestId, requireEnv } from "../_shared/whatsapp/http.ts";
import { recordOptOut } from "../_shared/whatsapp/optOuts.ts";
import { fromWaId } from "../_shared/whatsapp/phone.ts";
import {
  attentionCodeFor,
  classifyMetaError,
  errorKeyFor,
  isStopRequest,
  normalizeTier,
  templateStatusForEvent,
} from "../_shared/whatsapp/rules.ts";

const { log } = createLogger("whatsapp-webhook");

const DISCONNECT_EVENTS = new Set(["PARTNER_REMOVED", "PARTNER_APP_UNINSTALLED", "ACCOUNT_DELETED"]);
const ATTENTION_EVENTS = new Set([
  "ACCOUNT_OFFBOARDED",
  "ACCOUNT_VIOLATION",
  "ACCOUNT_RESTRICTION",
  "DISABLED_UPDATE",
]);
const STATUS_VALUES = new Set(["sent", "delivered", "read", "failed"]);

function text(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function verifyHandshake(url: URL) {
  const { WHATSAPP_WEBHOOK_VERIFY_TOKEN } = requireEnv(["WHATSAPP_WEBHOOK_VERIFY_TOKEN"]);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && timingSafeEqual(token, WHATSAPP_WEBHOOK_VERIFY_TOKEN)) {
    return text(challenge);
  }
  return text("Forbidden", 403);
}

async function signatureIsValid(req: Request, raw: string): Promise<boolean> {
  const { META_APP_SECRET } = requireEnv(["META_APP_SECRET"]);
  const header = req.headers.get("x-hub-signature-256") ?? "";
  if (!header.startsWith("sha256=")) return false;
  const expected = await hmacSha256Hex(META_APP_SECRET, raw);
  return timingSafeEqual(header.slice("sha256=".length), expected);
}

async function accountsFor(service, wabaId: string, phoneNumberId: string | null) {
  let query = service
    .from("whatsapp_accounts")
    .select("id, tenant_id, waba_id, phone_number_id, status, attention_code")
    .eq("waba_id", wabaId);
  if (phoneNumberId) query = query.eq("phone_number_id", phoneNumberId);
  const { data, error } = await query.order("connected_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function liveOf(accounts) {
  return accounts.find((a) => a.status !== "disconnected") ?? null;
}

async function applyStatuses(service, accounts, statuses) {
  for (const status of statuses ?? []) {
    if (!STATUS_VALUES.has(status.status)) continue;
    const error = status.errors?.[0] ?? null;
    const errorCode = typeof error?.code === "number" ? error.code : null;
    const params = {
      p_wamid: String(status.id ?? ""),
      p_callback_id: status.biz_opaque_callback_data ?? null,
      p_status: status.status,
      p_at: new Date(Number(status.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
      p_error_code: errorCode,
      p_error_title: error ? String(error.title ?? error.message ?? "").slice(0, 300) : null,
      p_error_key: error ? errorKeyFor(errorCode) : null,
      p_pricing_category: status.pricing?.category ?? null,
      p_billable: typeof status.pricing?.billable === "boolean" ? status.pricing.billable : null,
      p_recipient_user_id: status.recipient_user_id ?? null,
    };
    for (const account of accounts) {
      const { data: matched, error: rpcError } = await service.rpc("whatsapp_apply_status", {
        p_account_id: account.id,
        ...params,
      });
      if (rpcError) throw rpcError;
      if (!matched) continue;
      if (status.status === "failed" && classifyMetaError(errorCode, 0) === "account" && account.status !== "disconnected") {
        await markAttention(service, account.id, attentionCodeFor(errorCode) ?? "meta_error");
      }
      break;
    }
  }
}

async function senderPhone(service, account, message): Promise<string | null> {
  const fromPhone = fromWaId(message.from);
  if (fromPhone) return fromPhone;
  const userId = message.from_user_id ?? null;
  if (!userId) return null;
  const { data } = await service
    .from("whatsapp_messages")
    .select("to_phone_e164")
    .eq("account_id", account.id)
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.to_phone_e164 ?? null;
}

// Only a STOP request is acted on; message text is never stored.
async function applyInbound(service, account, messages) {
  if (!account) return;
  for (const message of messages ?? []) {
    const body = message.type === "text" ? message.text?.body : message.button?.text;
    if (!isStopRequest(body)) continue;
    const phone = await senderPhone(service, account, message);
    if (!phone) continue;
    const { data: last } = await service
      .from("whatsapp_messages")
      .select("customer_id")
      .eq("account_id", account.id)
      .eq("to_phone_e164", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await recordOptOut(service, {
      tenantId: account.tenant_id,
      phone,
      customerId: last?.customer_id ?? null,
      source: "stop_reply",
    });
  }
}

async function applyTemplateStatus(service, accounts, value) {
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0 || !value?.message_template_id) return;
  const status = templateStatusForEvent(value.event);
  const patch = {
    ...(status
      ? { status, rejection_reason: value.reason && value.reason !== "NONE" ? value.reason : null }
      : {}),
    ...(value.message_template_category ? { category: value.message_template_category } : {}),
  };
  if (Object.keys(patch).length === 0) return;
  const { error } = await service
    .from("whatsapp_templates")
    .update(patch)
    .in("account_id", ids)
    .eq("meta_template_id", String(value.message_template_id));
  if (error) throw error;
}

async function applyTemplateCategory(service, accounts, value) {
  const ids = accounts.map((a) => a.id);
  const category = value?.new_category ?? null;
  if (ids.length === 0 || !category || !value?.message_template_id) return;
  const { error } = await service
    .from("whatsapp_templates")
    .update({ category })
    .in("account_id", ids)
    .eq("meta_template_id", String(value.message_template_id));
  if (error) throw error;
}

async function applyAccountUpdate(service, accounts, value) {
  const event = String(value?.event ?? "");
  for (const account of accounts.filter((a) => a.status !== "disconnected")) {
    if (DISCONNECT_EVENTS.has(event)) {
      await retireAccount(service, account, { reason: event.toLowerCase(), unsubscribe: false });
    } else if (ATTENTION_EVENTS.has(event)) {
      await markAttention(service, account.id, event.toLowerCase());
    } else if (event === "ACCOUNT_RECONNECTED" && account.status === "needs_attention") {
      await service
        .from("whatsapp_accounts")
        .update({ status: "connected", attention_code: null })
        .eq("id", account.id);
    }
  }
}

async function applyAccountFields(service, accounts, patch: Record<string, unknown>) {
  const ids = accounts.filter((a) => a.status !== "disconnected").map((a) => a.id);
  if (ids.length === 0 || Object.keys(patch).length === 0) return;
  const { error } = await service.from("whatsapp_accounts").update(patch).in("id", ids);
  if (error) throw error;
}

async function handleChange(service, wabaId: string, change) {
  const value = change?.value ?? {};
  const phoneNumberId = value.metadata?.phone_number_id ?? null;
  switch (change?.field) {
    case "messages": {
      const accounts = await accountsFor(service, wabaId, phoneNumberId);
      await applyStatuses(service, accounts, value.statuses);
      await applyInbound(service, liveOf(accounts), value.messages);
      return;
    }
    case "message_template_status_update":
      return applyTemplateStatus(service, await accountsFor(service, wabaId, null), value);
    case "template_category_update":
      return applyTemplateCategory(service, await accountsFor(service, wabaId, null), value);
    case "account_update":
      return applyAccountUpdate(service, await accountsFor(service, wabaId, null), value);
    case "phone_number_quality_update": {
      const tier = normalizeTier(value.current_limit ?? value.max_daily_conversations_per_business);
      const quality = value.event === "FLAGGED" ? "RED" : value.event === "UNFLAGGED" ? "GREEN" : null;
      return applyAccountFields(service, await accountsFor(service, wabaId, null), {
        ...(tier ? { messaging_limit_tier: tier } : {}),
        ...(quality ? { quality_rating: quality } : {}),
      });
    }
    case "business_capability_update": {
      const tier = normalizeTier(value.max_daily_conversations_per_business ?? value.max_daily_conversation_per_phone);
      return applyAccountFields(service, await accountsFor(service, wabaId, null), tier ? { messaging_limit_tier: tier } : {});
    }
    case "phone_number_name_update": {
      const decision = value.decision ? String(value.decision) : null;
      return applyAccountFields(service, await accountsFor(service, wabaId, null), {
        ...(decision ? { name_status: decision } : {}),
        ...(decision === "APPROVED" && value.requested_verified_name
          ? { verified_name: value.requested_verified_name }
          : {}),
      });
    }
    default:
      return;
  }
}

Deno.serve(async (req) => {
  const reqId = newRequestId();
  const url = new URL(req.url);
  try {
    if (req.method === "GET") return verifyHandshake(url);
    if (req.method !== "POST") return text("Method not allowed", 405);

    const raw = await req.text();
    if (!(await signatureIsValid(req, raw))) {
      log(reqId, "bad_signature");
      return text("Invalid signature", 401);
    }
    const payload = JSON.parse(raw);
    if (payload?.object !== "whatsapp_business_account") return text("ignored");

    const service = serviceClient();
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await handleChange(service, String(entry.id ?? ""), change);
      }
    }
    log(reqId, "processed", { entries: payload.entry?.length ?? 0 });
    return text("ok");
  } catch (error) {
    log(reqId, "error", { message: error instanceof Error ? error.message : String(error) });
    return text("error", 500);
  }
});
