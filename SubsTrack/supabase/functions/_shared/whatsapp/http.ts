// @ts-nocheck — Deno runtime file.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SECRET_KEYS = /token|secret|pin|password|authorization|code_value/i;

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function redact(detail: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    safe[key] = SECRET_KEYS.test(key) ? "[redacted]" : value;
  }
  return safe;
}

// One JSON log line per event; secret-looking keys are always redacted.
export function createLogger(fn: string) {
  function log(reqId: string, event: string, detail: Record<string, unknown> = {}) {
    console.log(JSON.stringify({ fn, reqId, event, ...redact(detail) }));
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  function fail(reqId: string, error: HttpError) {
    log(reqId, "rejected", { status: error.status, code: error.code, ...error.detail });
    return json({ error: error.message, code: error.code }, error.status);
  }

  function crash(reqId: string, error: unknown) {
    log(reqId, "error", { message: error instanceof Error ? error.message : String(error) });
    return json({ error: "Something went wrong. Please try again.", code: "server_error" }, 500);
  }

  function metaFailure(reqId: string, error) {
    log(reqId, "meta_error", { metaCode: error.code, httpStatus: error.httpStatus, message: error.message });
    return json(
      { error: `WhatsApp (Meta) refused the request: ${error.message}`, code: "meta_error", metaCode: error.code },
      502,
    );
  }

  function handle(reqId: string, error: unknown) {
    if (error instanceof HttpError) return fail(reqId, error);
    if (error instanceof Error && error.name === "MetaError") return metaFailure(reqId, error);
    return crash(reqId, error);
  }

  return { log, json, fail, handle };
}

export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function requireEnv(names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) values[name] = value;
    else missing.push(name);
  }
  if (missing.length > 0) {
    throw new HttpError(500, "not_configured", "WhatsApp is not configured on the server.", { missing });
  }
  return values;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new HttpError(400, "invalid_body", "The request body is not valid JSON.");
  }
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const META_ID_REGEX = /^\d{5,25}$/;
