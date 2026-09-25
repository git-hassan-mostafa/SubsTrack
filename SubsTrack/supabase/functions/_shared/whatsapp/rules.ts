export type MetaErrorClass = "retry" | "permanent" | "account";

export type TemplateParameterFormat = "named" | "positional";

export interface TemplateValue {
  name: string;
  value: string;
}

export interface QueuedVariables {
  format: TemplateParameterFormat;
  values: TemplateValue[];
}

export interface TemplateComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: { type?: string; url?: string }[];
}

export const GRAPH_VERSION = "v25.0";

export const MAX_SEND_ATTEMPTS = 5;
export const DEFAULT_PARAM_MAX_LENGTH = 200;
export const RECIPIENTS_PER_REQUEST = 200;

const RETRY_CODES = new Set([
  1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 131057, 133004,
]);

const ACCOUNT_ATTENTION: Record<number, string> = {
  10: "permission_removed",
  190: "token_invalid",
  200: "permission_removed",
  368: "account_restricted",
  131031: "account_restricted",
  131042: "payment_method",
  133010: "number_not_registered",
};

const ERROR_KEYS: Record<number, string> = {
  100: "invalid_request",
  131021: "invalid_phone",
  131026: "not_on_whatsapp",
  131047: "window_closed",
  131049: "ecosystem_limit",
  131050: "user_stopped_marketing",
  132000: "template_params",
  132001: "template_missing",
  132005: "template_params",
  132007: "template_policy",
  132012: "template_params",
  132015: "template_paused",
  132016: "template_disabled",
  130429: "rate_limited",
  131048: "rate_limited",
  131056: "rate_limited",
};

const TIER_LIMITS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

const SENDABLE_BUTTONS = new Set(["QUICK_REPLY", "URL", "PHONE_NUMBER", "VOICE_CALL"]);

const EVENT_STATUS = new Map<string, string | null>([
  ["REINSTATED", "APPROVED"],
  ["UNARCHIVED", "APPROVED"],
  ["FLAGGED", null],
  ["LOCKED", null],
  ["UNLOCKED", null],
]);

const STOP_WORDS = new Set([
  "stop",
  "stop all",
  "unsubscribe",
  "إيقاف",
  "ايقاف",
  "أوقف",
  "اوقف",
  "توقف",
]);

// A network failure never lands here: its outcome is unknown, not retryable.
export function classifyMetaError(
  code: number | null,
  httpStatus: number,
): MetaErrorClass {
  if (code !== null && ACCOUNT_ATTENTION[code]) return "account";
  if (code !== null && RETRY_CODES.has(code)) return "retry";
  if (httpStatus >= 500) return "retry";
  return "permanent";
}

export function attentionCodeFor(code: number | null): string | null {
  return code === null ? null : (ACCOUNT_ATTENTION[code] ?? null);
}

export function errorKeyFor(code: number | null, httpStatus = 0): string {
  if (code !== null && ACCOUNT_ATTENTION[code]) return ACCOUNT_ATTENTION[code];
  if (code !== null && ERROR_KEYS[code]) return ERROR_KEYS[code];
  if (httpStatus >= 500) return "meta_unavailable";
  return "meta_error";
}

// Doubles from 30 s up to 30 min, with ±20% jitter so retries spread out.
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  const jitter = 0.8 + random() * 0.4;
  return Math.round(base * jitter);
}

export function shouldRetry(attempts: number): boolean {
  return attempts < MAX_SEND_ATTEMPTS;
}

// Unknown tiers fall back to the smallest one Meta gives a new business.
export function tierLimit(tier: string | null | undefined): number {
  return (tier && TIER_LIMITS[tier]) || TIER_LIMITS.TIER_250;
}

export function normalizeTier(raw: unknown): string | null {
  if (typeof raw === "string" && raw.startsWith("TIER_")) return raw;
  if (typeof raw === "number") {
    if (raw >= 100000) return "TIER_100K";
    if (raw >= 10000) return "TIER_10K";
    if (raw >= 2000) return "TIER_2K";
    if (raw >= 1000) return "TIER_1K";
    return "TIER_250";
  }
  return null;
}

// Only an exact STOP word counts: "stop by tomorrow" never opts out.
export function isStopRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return STOP_WORDS.has(cleaned);
}

// Meta refuses a parameter holding a newline, a tab or 4+ spaces in a row.
export function sanitizeParam(value: unknown, maxLength = DEFAULT_PARAM_MAX_LENGTH): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function templateParamNames(body: string | null | undefined): string[] {
  if (!body) return [];
  const names: string[] = [];
  for (const match of body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

// Sijil fills BODY text only; any other value to fill means it cannot send it.
export function isSendableTemplate(
  components: TemplateComponent[] | null | undefined,
): boolean {
  for (const component of components ?? []) {
    const type = String(component.type ?? "").toUpperCase();
    if (type === "BODY" || type === "FOOTER") continue;
    if (type === "HEADER") {
      if (component.format && component.format.toUpperCase() !== "TEXT") return false;
      if (templateParamNames(component.text).length > 0) return false;
      continue;
    }
    if (type === "BUTTONS") {
      for (const button of component.buttons ?? []) {
        const kind = String(button.type ?? "").toUpperCase();
        if (!SENDABLE_BUTTONS.has(kind)) return false;
        if (templateParamNames(button.url).length > 0) return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

// A template webhook event is not always a status: FLAGGED only warns.
export function templateStatusForEvent(event: unknown): string | null {
  const name = typeof event === "string" ? event.trim().toUpperCase() : "";
  if (!name) return null;
  return EVENT_STATUS.has(name) ? (EVENT_STATUS.get(name) ?? null) : name;
}

export function detectParameterFormat(names: string[]): TemplateParameterFormat {
  return names.length > 0 && names.every((n) => /^\d+$/.test(n))
    ? "positional"
    : "named";
}

export function renderTemplate(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (whole, name: string) => values[name] ?? whole,
  );
}

export function buildTemplateComponents(variables: QueuedVariables) {
  if (variables.values.length === 0) return [];
  const ordered =
    variables.format === "positional"
      ? [...variables.values].sort((a, b) => Number(a.name) - Number(b.name))
      : variables.values;
  return [
    {
      type: "body",
      parameters: ordered.map((v) =>
        variables.format === "named"
          ? { type: "text", parameter_name: v.name, text: v.value }
          : { type: "text", text: v.value },
      ),
    },
  ];
}

export function buildTemplateMessage(args: {
  to: string;
  templateName: string;
  language: string;
  variables: QueuedVariables;
  callbackId: string;
}) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.language },
      components: buildTemplateComponents(args.variables),
    },
    biz_opaque_callback_data: args.callbackId,
  };
}
