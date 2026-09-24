// @ts-nocheck — Deno runtime file.
import { phoneDetailsToColumns, retireAccount } from "../_shared/whatsapp/accounts.ts";
import { requireWhatsAppTenant, serviceClient } from "../_shared/whatsapp/auth.ts";
import {
  CURRENT_KEY_VERSION,
  decryptSecret,
  encryptSecret,
  randomPin,
  sha256Hex,
} from "../_shared/whatsapp/crypto.ts";
import {
  exchangeCode,
  fetchPhoneDetails,
  grantedWabaIds,
  graphRequest,
  MetaError,
  wabaPhoneNumberIds,
} from "../_shared/whatsapp/graph.ts";
import {
  corsHeaders,
  createLogger,
  HttpError,
  META_ID_REGEX,
  newRequestId,
  readJson,
} from "../_shared/whatsapp/http.ts";
import { submitSijilTemplates, syncTemplates } from "../_shared/whatsapp/templates.ts";

const { log, json, handle } = createLogger("whatsapp-onboard");
const PIN_MISMATCH_CODES = new Set([133005, 133006]);

async function loadSession(service, rawToken: unknown) {
  if (typeof rawToken !== "string" || rawToken.length < 20) {
    throw new HttpError(410, "session_expired", "This link has expired. Start again from Sijil.");
  }
  const { data: session } = await service
    .from("whatsapp_connect_sessions")
    .select("*")
    .eq("token_hash", await sha256Hex(rawToken))
    .maybeSingle();
  if (!session || session.used_at || new Date(session.expires_at) < new Date()) {
    throw new HttpError(410, "session_expired", "This link has expired. Start again from Sijil.");
  }
  await requireWhatsAppTenant(service, session.tenant_id);
  const { data: creator } = await service
    .from("users")
    .select("role, branch_id, active, tenant_id")
    .eq("id", session.created_by)
    .maybeSingle();
  const tenantWide =
    creator?.role === "superadmin" || (creator?.role === "admin" && creator?.branch_id === null);
  if (!creator?.active || creator.tenant_id !== session.tenant_id || !tenantWide) {
    throw new HttpError(403, "forbidden", "Only organization-wide admins can connect WhatsApp.");
  }
  return session;
}

// Proves the token reaches this WABA and number, so nobody claims another's.
async function assertOwnership(token: string, wabaId: string, phoneNumberId: string) {
  const granted = await grantedWabaIds(token);
  if (granted && !granted.includes(wabaId)) {
    throw new HttpError(403, "waba_not_granted", "Meta did not give Sijil access to this WhatsApp account.");
  }
  const phones = await wabaPhoneNumberIds(wabaId, token);
  if (!phones.includes(phoneNumberId)) {
    throw new HttpError(403, "waba_not_granted", "This phone number does not belong to the connected WhatsApp account.");
  }
}

async function assertNotOwnedElsewhere(service, tenantId: string, phoneNumberId: string) {
  const { data } = await service
    .from("whatsapp_accounts")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (data && data.tenant_id !== tenantId) {
    throw new HttpError(409, "already_connected_elsewhere", "This WhatsApp number is already connected to another Sijil organization.");
  }
}

async function registerNumber(phoneNumberId: string, token: string, pin: string) {
  await graphRequest("POST", `${phoneNumberId}/register`, token, {
    body: { messaging_product: "whatsapp", pin },
  });
}

async function startCoexistenceSync(phoneNumberId: string, token: string, reqId: string) {
  let started = true;
  for (const syncType of ["smb_app_state_sync", "history"]) {
    try {
      await graphRequest("POST", `${phoneNumberId}/smb_app_data`, token, {
        body: { messaging_product: "whatsapp", sync_type: syncType },
      });
    } catch (error) {
      started = false;
      log(reqId, "coexistence_sync_failed", { syncType, metaCode: error?.code ?? null });
    }
  }
  return started;
}

async function finalize(service, session, args, reqId: string) {
  const { token, wabaId, phoneNumberId, businessId, pin, coexistence, historySyncStarted } = args;
  const details = await fetchPhoneDetails(phoneNumberId, token);

  const { data: current } = await service
    .from("whatsapp_accounts")
    .select("id, tenant_id, waba_id, phone_number_id")
    .eq("tenant_id", session.tenant_id)
    .neq("status", "disconnected")
    .maybeSingle();
  if (current && current.phone_number_id !== phoneNumberId) {
    await retireAccount(service, current, {
      reason: "replaced",
      byUserId: session.created_by,
      unsubscribe: current.waba_id !== wabaId,
    });
  }

  const now = new Date().toISOString();
  const { data: account, error } = await service
    .from("whatsapp_accounts")
    .upsert(
      {
        tenant_id: session.tenant_id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        business_id: businessId,
        ...phoneDetailsToColumns(details),
        is_coexistence: coexistence,
        status: "connected",
        attention_code: null,
        consent_confirmed_by: session.created_by,
        consent_confirmed_at: session.created_at,
        connected_by: session.created_by,
        connected_at: now,
        disconnected_at: null,
        disconnected_by: null,
        disconnect_reason: null,
        history_sync_started_at: historySyncStarted ? now : null,
      },
      { onConflict: "tenant_id,phone_number_id" },
    )
    .select("id, tenant_id, waba_id, phone_number_id")
    .single();
  if (error) throw error;

  const { error: credentialError } = await service.from("whatsapp_credentials").upsert(
    {
      account_id: account.id,
      tenant_id: session.tenant_id,
      access_token_enc: await encryptSecret(token),
      pin_enc: pin ? await encryptSecret(pin) : null,
      key_version: CURRENT_KEY_VERSION,
    },
    { onConflict: "account_id" },
  );
  if (credentialError) throw credentialError;

  await service
    .from("whatsapp_connect_sessions")
    .update({
      used_at: now,
      pending_token_enc: null,
      pending_waba_id: null,
      pending_phone_number_id: null,
      pending_business_id: null,
    })
    .eq("id", session.id);

  try {
    await syncTemplates(service, account, token);
    await submitSijilTemplates(service, account, token, (event, detail) => log(reqId, event, detail));
  } catch (error) {
    log(reqId, "template_setup_failed", { message: error?.message ?? String(error) });
  }

  log(reqId, "connected", { tenantId: session.tenant_id, accountId: account.id, coexistence });
  return {
    ok: true,
    displayPhoneNumber: details?.display_phone_number ?? null,
    verifiedName: details?.verified_name ?? null,
  };
}

async function complete(service, body, reqId: string) {
  const session = await loadSession(service, body.s);
  const wabaId = String(body.wabaId ?? "");
  const phoneNumberId = String(body.phoneNumberId ?? "");
  const businessId = body.businessId ? String(body.businessId) : null;
  if (!META_ID_REGEX.test(wabaId) || !META_ID_REGEX.test(phoneNumberId)) {
    throw new HttpError(400, "invalid_signup", "Meta did not return the WhatsApp account details. Please try again.");
  }
  if (typeof body.code !== "string" || body.code.length < 10) {
    throw new HttpError(400, "invalid_signup", "Meta did not return a sign-in code. Please try again.");
  }
  const coexistence = body.flow === "coexistence";

  const token = await exchangeCode(body.code);
  await assertOwnership(token, wabaId, phoneNumberId);
  await assertNotOwnedElsewhere(service, session.tenant_id, phoneNumberId);
  await graphRequest("POST", `${wabaId}/subscribed_apps`, token);

  if (coexistence) {
    const historySyncStarted = await startCoexistenceSync(phoneNumberId, token, reqId);
    return finalize(service, session, {
      token, wabaId, phoneNumberId, businessId, pin: null, coexistence, historySyncStarted,
    }, reqId);
  }

  const pin = randomPin();
  try {
    await registerNumber(phoneNumberId, token, pin);
  } catch (error) {
    if (error instanceof MetaError && PIN_MISMATCH_CODES.has(error.code)) {
      await service
        .from("whatsapp_connect_sessions")
        .update({
          pending_token_enc: await encryptSecret(token),
          pending_waba_id: wabaId,
          pending_phone_number_id: phoneNumberId,
          pending_business_id: businessId,
        })
        .eq("id", session.id);
      throw new HttpError(409, "needs_pin", "This number already has a two-step verification PIN. Enter it to finish.");
    }
    throw error;
  }
  return finalize(service, session, {
    token, wabaId, phoneNumberId, businessId, pin, coexistence: false, historySyncStarted: false,
  }, reqId);
}

async function registerWithPin(service, body, reqId: string) {
  const session = await loadSession(service, body.s);
  const pin = String(body.pin ?? "");
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "invalid_pin", "The PIN must be 6 digits.");
  if (!session.pending_token_enc) {
    throw new HttpError(410, "session_expired", "This link has expired. Start again from Sijil.");
  }
  const token = await decryptSecret(session.pending_token_enc);
  try {
    await registerNumber(session.pending_phone_number_id, token, pin);
  } catch (error) {
    if (error instanceof MetaError && PIN_MISMATCH_CODES.has(error.code)) {
      throw new HttpError(409, "wrong_pin", "That PIN is not correct. Please try again.");
    }
    throw error;
  }
  return finalize(service, session, {
    token,
    wabaId: session.pending_waba_id,
    phoneNumberId: session.pending_phone_number_id,
    businessId: session.pending_business_id,
    pin,
    coexistence: false,
    historySyncStarted: false,
  }, reqId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqId = newRequestId();
  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const service = serviceClient();
    const body = await readJson(req);
    const action = String(body.action ?? "");
    log(reqId, "request", { action, flow: body.flow ?? null });
    if (action === "complete") return json(await complete(service, body, reqId));
    if (action === "register_pin") return json(await registerWithPin(service, body, reqId));
    throw new HttpError(400, "unknown_action", "Unknown action.");
  } catch (error) {
    return handle(reqId, error);
  }
});
