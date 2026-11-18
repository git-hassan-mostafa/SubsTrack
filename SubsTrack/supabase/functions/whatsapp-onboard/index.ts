// @ts-nocheck — Deno runtime file.
import { requireWhatsAppTenant, serviceClient } from "../_shared/whatsapp/auth.ts";
import {
  assertNotOwnedElsewhere,
  PIN_MISMATCH_CODES,
  registerNumber,
  saveAccount,
  setupTemplates,
} from "../_shared/whatsapp/connect.ts";
import { decryptSecret, encryptSecret, randomPin, sha256Hex } from "../_shared/whatsapp/crypto.ts";
import {
  exchangeCode,
  type GraphCredentials,
  grantedWabaIds,
  graphRequest,
  MetaError,
  sijilCredentials,
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

const { log, json, handle } = createLogger("whatsapp-onboard");

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
async function assertOwnership(creds: GraphCredentials, wabaId: string, phoneNumberId: string) {
  const granted = await grantedWabaIds(creds.token);
  if (granted && !granted.includes(wabaId)) {
    throw new HttpError(403, "waba_not_granted", "Meta did not give Sijil access to this WhatsApp account.");
  }
  const phones = await wabaPhoneNumberIds(wabaId, creds);
  if (!phones.includes(phoneNumberId)) {
    throw new HttpError(403, "waba_not_granted", "This phone number does not belong to the connected WhatsApp account.");
  }
}

async function startCoexistenceSync(phoneNumberId: string, creds: GraphCredentials, reqId: string) {
  let started = true;
  for (const syncType of ["smb_app_state_sync", "history"]) {
    try {
      await graphRequest("POST", `${phoneNumberId}/smb_app_data`, creds, {
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
  const { creds, wabaId, phoneNumberId, businessId, pin, coexistence, historySyncStarted } = args;
  const saved = await saveAccount(service, {
    tenantId: session.tenant_id,
    userId: session.created_by,
    consentAt: session.created_at,
    wabaId,
    phoneNumberId,
    businessId,
    appId: null,
    creds,
    ownAppSecret: false,
    pin,
    coexistence,
    historySyncStarted,
  });

  await service
    .from("whatsapp_connect_sessions")
    .update({
      used_at: new Date().toISOString(),
      pending_token_enc: null,
      pending_waba_id: null,
      pending_phone_number_id: null,
      pending_business_id: null,
    })
    .eq("id", session.id);

  await setupTemplates(service, saved.account, creds, (event, detail) => log(reqId, event, detail));

  log(reqId, "connected", { tenantId: session.tenant_id, accountId: saved.account.id, coexistence });
  return {
    ok: true,
    displayPhoneNumber: saved.displayPhoneNumber,
    verifiedName: saved.verifiedName,
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

  const creds = sijilCredentials(await exchangeCode(body.code));
  await assertOwnership(creds, wabaId, phoneNumberId);
  await assertNotOwnedElsewhere(service, session.tenant_id, phoneNumberId);
  await graphRequest("POST", `${wabaId}/subscribed_apps`, creds);

  if (coexistence) {
    const historySyncStarted = await startCoexistenceSync(phoneNumberId, creds, reqId);
    return finalize(service, session, {
      creds, wabaId, phoneNumberId, businessId, pin: null, coexistence, historySyncStarted,
    }, reqId);
  }

  const pin = randomPin();
  try {
    await registerNumber(phoneNumberId, creds, pin);
  } catch (error) {
    if (error instanceof MetaError && PIN_MISMATCH_CODES.has(error.code)) {
      await service
        .from("whatsapp_connect_sessions")
        .update({
          pending_token_enc: await encryptSecret(creds.token),
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
    creds, wabaId, phoneNumberId, businessId, pin, coexistence: false, historySyncStarted: false,
  }, reqId);
}

async function registerWithPin(service, body, reqId: string) {
  const session = await loadSession(service, body.s);
  const pin = String(body.pin ?? "");
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "invalid_pin", "The PIN must be 6 digits.");
  if (!session.pending_token_enc) {
    throw new HttpError(410, "session_expired", "This link has expired. Start again from Sijil.");
  }
  const creds = sijilCredentials(await decryptSecret(session.pending_token_enc));
  try {
    await registerNumber(session.pending_phone_number_id, creds, pin);
  } catch (error) {
    if (error instanceof MetaError && PIN_MISMATCH_CODES.has(error.code)) {
      throw new HttpError(409, "wrong_pin", "That PIN is not correct. Please try again.");
    }
    throw error;
  }
  return finalize(service, session, {
    creds,
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
