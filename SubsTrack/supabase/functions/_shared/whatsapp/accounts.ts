// @ts-nocheck — Deno runtime file.
import { decryptSecret } from "./crypto.ts";
import { type GraphCredentials, graphRequest, sijilAppSecret } from "./graph.ts";
import { HttpError } from "./http.ts";
import { regionOf } from "./phone.ts";
import { normalizeTier } from "./rules.ts";

export const ACCOUNT_COLUMNS =
  "id, tenant_id, waba_id, phone_number_id, display_phone_number, verified_name, default_region, is_coexistence, status, attention_code, messaging_limit_tier, app_id, webhook_auto";

export async function liveAccount(service, tenantId: string) {
  const { data, error } = await service
    .from("whatsapp_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("tenant_id", tenantId)
    .neq("status", "disconnected")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireLiveAccount(service, tenantId: string) {
  const account = await liveAccount(service, tenantId);
  if (!account) {
    throw new HttpError(409, "not_connected", "WhatsApp is not connected for your organization.");
  }
  return account;
}

export async function ownAppSecret(service, accountId: string): Promise<string | null> {
  const { data, error } = await service
    .from("whatsapp_credentials")
    .select("app_secret_enc")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data?.app_secret_enc ? decryptSecret(data.app_secret_enc) : null;
}

// An own-app account signs with its own secret; a popup account with Sijil's.
export async function accountCredentials(
  service,
  accountId: string,
): Promise<GraphCredentials | null> {
  const { data, error } = await service
    .from("whatsapp_credentials")
    .select("access_token_enc, app_secret_enc")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    token: await decryptSecret(data.access_token_enc),
    appSecret: data.app_secret_enc ? await decryptSecret(data.app_secret_enc) : sijilAppSecret(),
  };
}

export async function requireCredentials(service, accountId: string): Promise<GraphCredentials> {
  const creds = await accountCredentials(service, accountId);
  if (!creds) throw new HttpError(409, "token_invalid", "Please connect WhatsApp again.");
  return creds;
}

export async function markAttention(service, accountId: string, attentionCode: string) {
  await service
    .from("whatsapp_accounts")
    .update({ status: "needs_attention", attention_code: attentionCode })
    .eq("id", accountId)
    .neq("status", "disconnected");
}

export function phoneDetailsToColumns(details) {
  return {
    display_phone_number: details?.display_phone_number ?? null,
    verified_name: details?.verified_name ?? null,
    quality_rating: details?.quality_rating ?? null,
    name_status: details?.name_status ?? null,
    messaging_limit_tier: normalizeTier(
      details?.whatsapp_business_manager_messaging_limit?.current_limit ??
        details?.whatsapp_business_manager_messaging_limit,
    ),
    default_region: regionOf(details?.display_phone_number),
  };
}

export async function cancelQueued(service, accountId: string, errorKey: string) {
  await service
    .from("whatsapp_messages")
    .update({ status: "cancelled", error_key: errorKey, variables: null })
    .eq("account_id", accountId)
    .eq("status", "queued");
}

// Stops this account's app from getting the WABA's webhooks; never throws.
export async function unsubscribeApp(service, account) {
  const creds = await accountCredentials(service, account.id).catch(() => null);
  if (creds) {
    await graphRequest("DELETE", `${account.waba_id}/subscribed_apps`, creds).catch(() => null);
  }
}

// Keeps the account row and its history; only the secret and the queue go.
export async function retireAccount(
  service,
  account,
  options: { reason: string; byUserId?: string | null; unsubscribe: boolean },
) {
  if (options.unsubscribe) await unsubscribeApp(service, account);
  await cancelQueued(service, account.id, "disconnected");
  await service.from("whatsapp_credentials").delete().eq("account_id", account.id);
  await service
    .from("whatsapp_accounts")
    .update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      disconnected_by: options.byUserId ?? null,
      disconnect_reason: options.reason,
      attention_code: null,
    })
    .eq("id", account.id);
}
