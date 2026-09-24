// @ts-nocheck — Deno runtime file.
import { decryptSecret } from "./crypto.ts";
import { graphRequest } from "./graph.ts";
import { HttpError } from "./http.ts";
import { regionOf } from "./phone.ts";
import { normalizeTier } from "./rules.ts";

export const ACCOUNT_COLUMNS =
  "id, tenant_id, waba_id, phone_number_id, display_phone_number, verified_name, default_region, is_coexistence, status, attention_code, messaging_limit_tier";

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

export async function accountToken(service, accountId: string): Promise<string | null> {
  const { data, error } = await service
    .from("whatsapp_credentials")
    .select("access_token_enc")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data ? decryptSecret(data.access_token_enc) : null;
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

// Keeps the account row and its history; only the secret and the queue go.
export async function retireAccount(
  service,
  account,
  options: { reason: string; byUserId?: string | null; unsubscribe: boolean },
) {
  if (options.unsubscribe) {
    const token = await accountToken(service, account.id).catch(() => null);
    if (token) {
      await graphRequest("DELETE", `${account.waba_id}/subscribed_apps`, token).catch(() => null);
    }
  }
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
