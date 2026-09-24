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

function appCredentials() {
  const env = requireEnv(["META_APP_ID", "META_APP_SECRET"]);
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET };
}

// appsecret_proof makes a leaked token useless without our app secret.
async function appSecretProof(token: string): Promise<string> {
  return hmacSha256Hex(appCredentials().appSecret, token);
}

async function parseResponse(response: Response) {
  const text = await response.text();
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

export async function graphRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
) {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("appsecret_proof", await appSecretProof(token));

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
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
  const body = await parseResponse(
    await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  if (!body?.access_token) throw new MetaError("Meta returned no access token", null, 200, null);
  return body.access_token;
}

export async function grantedWabaIds(token: string): Promise<string[] | null> {
  const { appId, appSecret } = appCredentials();
  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set("input_token", token);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const body = await parseResponse(
    await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  const scopes = body?.data?.granular_scopes;
  if (!Array.isArray(scopes)) return null;
  const ids = new Set<string>();
  for (const scope of scopes) {
    if (!String(scope.scope ?? "").startsWith("whatsapp_business")) continue;
    for (const id of scope.target_ids ?? []) ids.add(String(id));
  }
  return ids.size > 0 ? [...ids] : null;
}

export async function wabaPhoneNumberIds(wabaId: string, token: string): Promise<string[]> {
  const body = await graphRequest("GET", `${wabaId}/phone_numbers`, token, {
    query: { fields: "id", limit: "100" },
  });
  return (body?.data ?? []).map((row) => String(row.id));
}

export function fetchPhoneDetails(phoneNumberId: string, token: string) {
  return graphRequest("GET", phoneNumberId, token, { query: { fields: PHONE_FIELDS } });
}
