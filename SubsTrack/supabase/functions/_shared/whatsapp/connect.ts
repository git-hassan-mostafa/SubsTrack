// @ts-nocheck — Deno runtime file.
import { phoneDetailsToColumns, retireAccount, unsubscribeApp } from "./accounts.ts";
import { CURRENT_KEY_VERSION, encryptSecret } from "./crypto.ts";
import { fetchPhoneDetails, type GraphCredentials, graphRequest } from "./graph.ts";
import { HttpError, requireEnv } from "./http.ts";
import { submitSijilTemplates, syncTemplates } from "./templates.ts";

export const PIN_MISMATCH_CODES = new Set([133005, 133006]);

type Log = (event: string, detail?: Record<string, unknown>) => void;

export interface SaveAccountInput {
  tenantId: string;
  userId: string;
  consentAt: string;
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
  appId: string | null;
  creds: GraphCredentials;
  ownAppSecret: boolean;
  pin: string | null;
  coexistence: boolean;
  historySyncStarted: boolean;
}

export async function assertNotOwnedElsewhere(service, tenantId: string, phoneNumberId: string) {
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

export async function registerNumber(phoneNumberId: string, creds: GraphCredentials, pin: string) {
  await graphRequest("POST", `${phoneNumberId}/register`, creds, {
    body: { messaging_product: "whatsapp", pin },
  });
}

// The old app keeps the WABA's webhooks unless it is unsubscribed when the app changes.
async function retireOrDetachCurrent(service, input: SaveAccountInput) {
  const { data: current } = await service
    .from("whatsapp_accounts")
    .select("id, tenant_id, waba_id, phone_number_id, app_id")
    .eq("tenant_id", input.tenantId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (!current) return;
  const appChanged = (current.app_id ?? null) !== input.appId;
  if (current.phone_number_id !== input.phoneNumberId) {
    await retireAccount(service, current, {
      reason: "replaced",
      byUserId: input.userId,
      unsubscribe: appChanged || current.waba_id !== input.wabaId,
    });
  } else if (appChanged) {
    await unsubscribeApp(service, current);
  }
}

export async function saveAccount(service, input: SaveAccountInput) {
  const details = await fetchPhoneDetails(input.phoneNumberId, input.creds);
  await retireOrDetachCurrent(service, input);

  const now = new Date().toISOString();
  const { data: account, error } = await service
    .from("whatsapp_accounts")
    .upsert(
      {
        tenant_id: input.tenantId,
        waba_id: input.wabaId,
        phone_number_id: input.phoneNumberId,
        business_id: input.businessId,
        app_id: input.appId,
        webhook_auto: false,
        ...phoneDetailsToColumns(details),
        is_coexistence: input.coexistence,
        status: "connected",
        attention_code: null,
        consent_confirmed_by: input.userId,
        consent_confirmed_at: input.consentAt,
        connected_by: input.userId,
        connected_at: now,
        disconnected_at: null,
        disconnected_by: null,
        disconnect_reason: null,
        history_sync_started_at: input.historySyncStarted ? now : null,
      },
      { onConflict: "tenant_id,phone_number_id" },
    )
    .select("id, tenant_id, waba_id, phone_number_id, app_id")
    .single();
  if (error) throw error;

  const { error: credentialError } = await service.from("whatsapp_credentials").upsert(
    {
      account_id: account.id,
      tenant_id: input.tenantId,
      access_token_enc: await encryptSecret(input.creds.token),
      app_secret_enc: input.ownAppSecret ? await encryptSecret(input.creds.appSecret) : null,
      pin_enc: input.pin ? await encryptSecret(input.pin) : null,
      key_version: CURRENT_KEY_VERSION,
    },
    { onConflict: "account_id" },
  );
  if (credentialError) throw credentialError;

  return {
    account,
    displayPhoneNumber: details?.display_phone_number ?? null,
    verifiedName: details?.verified_name ?? null,
  };
}

// Template trouble never undoes a connection; the admin can submit again.
export async function setupTemplates(service, account, creds: GraphCredentials, log: Log) {
  try {
    await syncTemplates(service, account, creds);
    await submitSijilTemplates(service, account, creds, log);
  } catch (error) {
    log("template_setup_failed", { message: error?.message ?? String(error) });
  }
}

export function webhookTarget() {
  const env = requireEnv(["SUPABASE_URL", "ANON_KEY", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]);
  const url = new URL(`${env.SUPABASE_URL}/functions/v1/whatsapp-webhook`);
  url.searchParams.set("apikey", env.ANON_KEY);
  return { url: url.toString(), verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN };
}

const REQUIRED_WEBHOOK_FIELDS = ["messages", "message_template_status_update", "account_update"];

function logGraphFailure(log: Log, event: string, error) {
  log(event, { metaCode: error?.code ?? null, message: error?.message ?? String(error) });
}

function sameEndpoint(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return false;
  }
}

// The admin's hand-pasted webhook lives on the app, readable only with the app token.
async function appWebhookReachesSijil(account, creds: GraphCredentials, targetUrl: string): Promise<boolean> {
  if (!account.app_id) return false;
  const appToken = { token: `${account.app_id}|${creds.appSecret}`, appSecret: creds.appSecret };
  const body = await graphRequest("GET", `${account.app_id}/subscriptions`, appToken);
  const subscription = (body?.data ?? []).find(
    (s) => s.object === "whatsapp_business_account" && s.active !== false,
  );
  if (!subscription || !sameEndpoint(String(subscription.callback_url ?? ""), targetUrl)) return false;
  const fields = new Set((subscription.fields ?? []).map((f) => (typeof f === "string" ? f : f?.name)));
  return REQUIRED_WEBHOOK_FIELDS.every((field) => fields.has(field));
}

async function attempt(log: Log, event: string, call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (error) {
    logGraphFailure(log, event, error);
    return false;
  }
}

// Events need the app subscribed to the WABA first; the override needs it too.
export async function setWebhookOverride(service, account, creds: GraphCredentials, log: Log) {
  const target = webhookTarget();
  const subscribed = await attempt(log, "webhook_subscribe_failed", () =>
    graphRequest("POST", `${account.waba_id}/subscribed_apps`, creds),
  );
  let ok =
    subscribed &&
    (await attempt(log, "webhook_override_failed", () =>
      graphRequest("POST", `${account.waba_id}/subscribed_apps`, creds, {
        body: { override_callback_uri: target.url, verify_token: target.verifyToken },
      }),
    ));
  if (subscribed && !ok) {
    ok = await appWebhookReachesSijil(account, creds, target.url).catch((error) => {
      logGraphFailure(log, "webhook_check_failed", error);
      return false;
    });
  }
  await service.from("whatsapp_accounts").update({ webhook_auto: ok }).eq("id", account.id);
  return ok;
}
