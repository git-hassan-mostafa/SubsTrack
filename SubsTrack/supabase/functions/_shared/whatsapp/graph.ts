// @ts-nocheck — Deno runtime file.
import { hmacSha256Hex } from "./crypto.ts";
import { requireEnv } from "./http.ts";
import { GRAPH_VERSION } from "./rules.ts";

export { GRAPH_VERSION };
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 20_000;

export const PHONE_FIELDS = [
  "display_phone_number",
  "verified_name",
  "status",
  "code_verification_status",
  "name_status",
  "quality_rating",
  "whatsapp_business_manager_messaging_limit",
  "platform_type",
  "is_on_biz_app",
].join(",");

export class MetaError extends Error {
  constructor(
    message: string,
    public code: number | null,
    public httpStatus: number,
    public title: string | null,
    public networkFailure = false,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

export interface GraphCredentials {
  token: string;
  appSecret: string;
}

export interface PhoneNumberChoice {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

function appCredentials() {
  const env = requireEnv(["META_APP_ID", "META_APP_SECRET"]);
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

export function sijilAppSecret(): string {
  return requireEnv(["META_APP_SECRET"]).META_APP_SECRET;
}

export function sijilCredentials(token: string): GraphCredentials {
  return { token, appSecret: sijilAppSecret() };
}

// appsecret_proof makes a leaked token useless without that app's own secret.
function appSecretProof(creds: GraphCredentials): Promise<string> {
  return hmacSha256Hex(creds.appSecret, creds.token);
}

// A reply cut off mid-body already left our side: a network failure.
async function parseResponse(response: Response) {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new MetaError(
      error instanceof Error ? error.message : "Network error",
      null,
      response.status,
      null,
      true,
    );
  }
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.error) {
    const err = body?.error ?? {};
    throw new MetaError(
      err.error_user_msg || err.message || `Meta returned HTTP ${response.status}`,
      typeof err.code === "number" ? err.code : null,
      response.status,
      err.error_user_title || err.type || null,
    );
  }
  return body;
}

async function fetchJson(url: URL) {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new MetaError(
      error instanceof Error ? error.message : "Network error",
      null,
      0,
      null,
      true,
    );
  }
  return parseResponse(response);
}

export async function graphRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  creds: GraphCredentials,
  options: { query?: Record<string, string>; body?: unknown } = {},
) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("appsecret_proof", await appSecretProof(creds));

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new MetaError(
      error instanceof Error ? error.message : "Network error",
      null,
      0,
      null,
      true,
    );
  }
  return parseResponse(response);
}

// The Embedded Signup code lives 30 seconds: exchange it before anything else.
export async function exchangeCode(code: string): Promise<string> {
  const { appId, appSecret } = appCredentials();
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  const body = await fetchJson(url);
  if (!body?.access_token) throw new MetaError("Meta returned no access token", null, 200, null);
  return body.access_token;
}

function scopeTargetIds(tokenData, matches: (scope: string) => boolean): string[] {
  const ids = new Set<string>();
  for (const scope of tokenData?.granular_scopes ?? []) {
    if (!matches(String(scope.scope ?? ""))) continue;
    for (const id of scope.target_ids ?? []) ids.add(String(id));
  }
  return [...ids];
}

export function wabaIdsOfToken(tokenData): string[] {
  return scopeTargetIds(tokenData, (scope) => scope.startsWith("whatsapp_business"));
}

export function businessIdsOfToken(tokenData): string[] {
  return scopeTargetIds(tokenData, (scope) => scope === "business_management");
}

export async function grantedWabaIds(token: string): Promise<string[] | null> {
  const { appId, appSecret } = appCredentials();
  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const ids = wabaIdsOfToken((await fetchJson(url))?.data);
  return ids.length > 0 ? ids : null;
}

// A token inspecting itself: needs nothing but the tenant's own keys.
export async function inspectOwnToken(creds: GraphCredentials) {
  const body = await graphRequest("GET", "debug_token", creds, {
    query: { input_token: creds.token },
  });
  return body?.data ?? null;
}

// Only the real app secret turns into a working app access token.
export async function assertAppSecret(appId: string, appSecret: string) {
  const url = new URL(`${GRAPH_BASE}/${appId}`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  await fetchJson(url);
}

export async function ownedWabaIds(businessId: string, creds: GraphCredentials): Promise<string[]> {
  const body = await graphRequest("GET", `${businessId}/owned_whatsapp_business_accounts`, creds, {
    query: { fields: "id", limit: "100" },
  });
  return (body?.data ?? []).map((row) => String(row.id));
}

export async function wabaPhoneNumbers(
  wabaId: string,
  creds: GraphCredentials,
): Promise<PhoneNumberChoice[]> {
  const body = await graphRequest("GET", `${wabaId}/phone_numbers`, creds, {
    query: { fields: "id,display_phone_number,verified_name", limit: "100" },
  });
  return (body?.data ?? []).map((row) => ({
    phoneNumberId: String(row.id),
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
  }));
}

export async function wabaPhoneNumberIds(wabaId: string, creds: GraphCredentials): Promise<string[]> {
  return (await wabaPhoneNumbers(wabaId, creds)).map((phone) => phone.phoneNumberId);
}

export function fetchPhoneDetails(phoneNumberId: string, creds: GraphCredentials) {
  return graphRequest("GET", phoneNumberId, creds, { query: { fields: PHONE_FIELDS } });
}
