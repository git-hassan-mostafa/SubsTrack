// @ts-nocheck — Deno runtime file.
import {
  accountToken,
  phoneDetailsToColumns,
  requireLiveAccount,
  retireAccount,
} from "../_shared/whatsapp/accounts.ts";
import { readAppOptions, requireAdmin, serviceClient } from "../_shared/whatsapp/auth.ts";
import { randomToken, sha256Hex } from "../_shared/whatsapp/crypto.ts";
import { fetchPhoneDetails } from "../_shared/whatsapp/graph.ts";
import {
  corsHeaders,
  createLogger,
  HttpError,
  newRequestId,
  readJson,
  UUID_REGEX,
} from "../_shared/whatsapp/http.ts";
import { toE164 } from "../_shared/whatsapp/phone.ts";
import { submitSijilTemplates, syncTemplates } from "../_shared/whatsapp/templates.ts";

const { log, json, handle } = createLogger("whatsapp-admin");
const SESSION_MINUTES = 15;
const REQUIRED_OPTIONS = ["WhatsAppAppId", "WhatsAppConfigId", "WhatsAppConnectUrl"];

async function startConnect(service, caller, body) {
  if (body.consent !== true) {
    throw new HttpError(400, "consent_required", "Please confirm you have your customers' permission first.");
  }
  const options = await readAppOptions(service, REQUIRED_OPTIONS);
  if (REQUIRED_OPTIONS.some((key) => !options[key])) {
    throw new HttpError(409, "not_configured", "WhatsApp is not set up by Sijil yet. Please contact support.");
  }
  const token = randomToken();
  const { error } = await service.from("whatsapp_connect_sessions").insert({
    tenant_id: caller.tenantId,
    created_by: caller.userId,
    token_hash: await sha256Hex(token),
    expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
  });
  if (error) throw error;
  const url = new URL(options.WhatsAppConnectUrl);
  url.searchParams.set("s", token);
  return { url: url.toString(), expiresInMinutes: SESSION_MINUTES };
}

async function refresh(service, caller) {
  const account = await requireLiveAccount(service, caller.tenantId);
  const token = await accountToken(service, account.id);
  if (!token) throw new HttpError(409, "token_invalid", "Please connect WhatsApp again.");
  const details = await fetchPhoneDetails(account.phone_number_id, token);
  const phoneOk = !details?.status || details.status === "CONNECTED";
  await service
    .from("whatsapp_accounts")
    .update({
      ...phoneDetailsToColumns(details),
      status: phoneOk ? "connected" : "needs_attention",
      attention_code: phoneOk ? null : `phone_${String(details.status).toLowerCase()}`,
    })
    .eq("id", account.id);
  await syncTemplates(service, account, token);
  return { ok: true };
}

async function submitTemplates(service, caller, reqId) {
  const account = await requireLiveAccount(service, caller.tenantId);
  const token = await accountToken(service, account.id);
  if (!token) throw new HttpError(409, "token_invalid", "Please connect WhatsApp again.");
  await syncTemplates(service, account, token);
  const submitted = await submitSijilTemplates(service, account, token, (event, detail) =>
    log(reqId, event, detail),
  );
  return { submitted };
}

async function disconnect(service, caller) {
  const account = await requireLiveAccount(service, caller.tenantId);
  await retireAccount(service, account, {
    reason: "admin",
    byUserId: caller.userId,
    unsubscribe: true,
  });
  return { ok: true };
}

async function setOptOut(service, caller, body) {
  const customerId = String(body.customerId ?? "");
  if (!UUID_REGEX.test(customerId)) throw new HttpError(400, "invalid_customer", "Unknown customer.");
  const { data: customer } = await service
    .from("customers")
    .select("id, tenant_id, branch_id, phone_number")
    .eq("id", customerId)
    .eq("tenant_id", caller.tenantId)
    .maybeSingle();
  if (!customer || (caller.branchId && customer.branch_id !== caller.branchId)) {
    throw new HttpError(404, "invalid_customer", "Unknown customer.");
  }
  const account = await requireLiveAccount(service, caller.tenantId);
  const phone = toE164(customer.phone_number, account.default_region);
  if (!phone) throw new HttpError(400, "invalid_phone", "This customer's phone number is not valid.");

  if (body.optedOut === true) {
    const { data: existing } = await service
      .from("whatsapp_opt_outs")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("phone_e164", phone)
      .is("cleared_at", null)
      .maybeSingle();
    if (!existing) {
      const { error } = await service.from("whatsapp_opt_outs").insert({
        tenant_id: caller.tenantId,
        phone_e164: phone,
        customer_id: customer.id,
        source: "admin",
        created_by: caller.userId,
      });
      if (error) throw error;
    }
  } else {
    const { error } = await service
      .from("whatsapp_opt_outs")
      .update({ cleared_at: new Date().toISOString(), cleared_by: caller.userId })
      .eq("tenant_id", caller.tenantId)
      .eq("phone_e164", phone)
      .is("cleared_at", null);
    if (error) throw error;
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqId = newRequestId();
  try {
    const service = serviceClient();
    const body = await readJson(req);
    const action = String(body.action ?? "");
    log(reqId, "request", { action });

    if (action === "set_opt_out") {
      const caller = await requireAdmin(req, service, { tenantWide: false });
      return json(await setOptOut(service, caller, body));
    }

    const caller = await requireAdmin(req, service, { tenantWide: true });
    if (action === "start_connect") return json(await startConnect(service, caller, body));
    if (action === "refresh") return json(await refresh(service, caller));
    if (action === "submit_templates") return json(await submitTemplates(service, caller, reqId));
    if (action === "disconnect") return json(await disconnect(service, caller));
    throw new HttpError(400, "unknown_action", "Unknown action.");
  } catch (error) {
    return handle(reqId, error);
  }
});
