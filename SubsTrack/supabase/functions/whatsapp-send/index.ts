// @ts-nocheck — Deno runtime file.
import { requireLiveAccount } from "../_shared/whatsapp/accounts.ts";
import { requireAdmin, serviceClient } from "../_shared/whatsapp/auth.ts";
import {
  corsHeaders,
  createLogger,
  HttpError,
  newRequestId,
  readJson,
  UUID_REGEX,
} from "../_shared/whatsapp/http.ts";
import { toE164 } from "../_shared/whatsapp/phone.ts";
import { processQueue } from "../_shared/whatsapp/queue.ts";
import {
  DEFAULT_PARAM_MAX_LENGTH,
  RECIPIENTS_PER_REQUEST,
  sanitizeParam,
} from "../_shared/whatsapp/rules.ts";
import { sijilTemplateByName } from "../_shared/whatsapp/sijilTemplates.ts";

const { log, json, handle } = createLogger("whatsapp-send");
const RECENT_HOURS = 24;

type SkipReason =
  | "not_found"
  | "other_branch"
  | "inactive"
  | "no_phone"
  | "invalid_phone"
  | "opted_out"
  | "recently_sent"
  | "missing_values";

function parseRecipients(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "no_recipients", "Choose at least one customer.");
  }
  if (raw.length > RECIPIENTS_PER_REQUEST) {
    throw new HttpError(400, "too_many_recipients", `Send at most ${RECIPIENTS_PER_REQUEST} customers per request.`);
  }
  const seen = new Set<string>();
  const recipients = [];
  for (const item of raw) {
    const customerId = String(item?.customerId ?? "");
    if (!UUID_REGEX.test(customerId) || seen.has(customerId)) continue;
    seen.add(customerId);
    recipients.push({ customerId, values: item?.values && typeof item.values === "object" ? item.values : {} });
  }
  return recipients;
}

async function loadTemplate(service, caller, account, templateId: string) {
  if (!UUID_REGEX.test(templateId)) throw new HttpError(400, "invalid_template", "Choose a message template.");
  const { data: template } = await service
    .from("whatsapp_templates")
    .select("id, name, language, status, supported, params, parameter_format, purpose, account_id, tenant_id")
    .eq("id", templateId)
    .eq("tenant_id", caller.tenantId)
    .eq("account_id", account.id)
    .maybeSingle();
  if (!template) throw new HttpError(404, "invalid_template", "This template is not available.");
  if (template.status !== "APPROVED") {
    throw new HttpError(409, "template_not_approved", "Meta has not approved this template yet.");
  }
  if (!template.supported) {
    throw new HttpError(409, "template_not_supported", "Sijil cannot send this template yet.");
  }
  return template;
}

function buildVariables(template, values: Record<string, unknown>) {
  const spec = sijilTemplateByName(template.name);
  const params: string[] = Array.isArray(template.params) ? template.params : [];
  const clean = [];
  for (const name of params) {
    const value = sanitizeParam(values[name], spec?.maxLength[name] ?? DEFAULT_PARAM_MAX_LENGTH);
    if (!value) return null;
    clean.push({ name, value });
  }
  return { format: template.parameter_format, values: clean };
}

async function queue(service, caller, body, reqId: string) {
  const requestId = String(body.requestId ?? "");
  if (!UUID_REGEX.test(requestId)) throw new HttpError(400, "invalid_request", "Missing request id.");
  const recipients = parseRecipients(body.recipients);
  const account = await requireLiveAccount(service, caller.tenantId);
  if (account.status !== "connected") {
    throw new HttpError(409, "account_needs_attention", "Your WhatsApp account needs attention. Open Admin → WhatsApp.");
  }
  const template = await loadTemplate(service, caller, account, String(body.templateId ?? ""));
  const ids = recipients.map((r) => r.customerId);

  const { data: customers, error: customerError } = await service
    .from("customers")
    .select("id, branch_id, active, phone_number")
    .eq("tenant_id", caller.tenantId)
    .in("id", ids);
  if (customerError) throw customerError;
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  const skipped: { customerId: string; reason: SkipReason }[] = [];
  const candidates = [];
  for (const recipient of recipients) {
    const customer = customerById.get(recipient.customerId);
    const skip = (reason: SkipReason) => skipped.push({ customerId: recipient.customerId, reason });
    if (!customer) { skip("not_found"); continue; }
    if (caller.branchId && customer.branch_id !== caller.branchId) { skip("other_branch"); continue; }
    if (!customer.active) { skip("inactive"); continue; }
    if (!customer.phone_number?.trim()) { skip("no_phone"); continue; }
    const phone = toE164(customer.phone_number, account.default_region);
    if (!phone) { skip("invalid_phone"); continue; }
    const variables = buildVariables(template, recipient.values);
    if (!variables) { skip("missing_values"); continue; }
    candidates.push({ customer, phone, variables });
  }

  const phones = [...new Set(candidates.map((c) => c.phone))];
  const { data: optOuts } = phones.length
    ? await service
        .from("whatsapp_opt_outs")
        .select("phone_e164")
        .eq("tenant_id", caller.tenantId)
        .is("cleared_at", null)
        .in("phone_e164", phones)
    : { data: [] };
  const optedOut = new Set((optOuts ?? []).map((o) => o.phone_e164));

  const since = new Date(Date.now() - RECENT_HOURS * 60 * 60_000).toISOString();
  const { data: recent } = body.force === true || candidates.length === 0
    ? { data: [] }
    : await service
        .from("whatsapp_messages")
        .select("customer_id")
        .eq("tenant_id", caller.tenantId)
        .eq("template_name", template.name)
        .gt("created_at", since)
        .not("status", "in", "(failed,cancelled)")
        .neq("batch_id", requestId)
        .in("customer_id", candidates.map((c) => c.customer.id));
  const recentlySent = new Set((recent ?? []).map((r) => r.customer_id));

  const rows = [];
  for (const candidate of candidates) {
    if (optedOut.has(candidate.phone)) {
      skipped.push({ customerId: candidate.customer.id, reason: "opted_out" });
      continue;
    }
    if (recentlySent.has(candidate.customer.id)) {
      skipped.push({ customerId: candidate.customer.id, reason: "recently_sent" });
      continue;
    }
    rows.push({
      tenant_id: caller.tenantId,
      account_id: account.id,
      branch_id: candidate.customer.branch_id,
      customer_id: candidate.customer.id,
      batch_id: requestId,
      sent_by: caller.userId,
      template_id: template.id,
      template_name: template.name,
      language: template.language,
      purpose: template.purpose,
      to_phone_e164: candidate.phone,
      variables: candidate.variables,
      idempotency_key: `${requestId}:${candidate.customer.id}`,
    });
  }

  if (rows.length > 0) {
    const { error } = await service
      .from("whatsapp_messages")
      .upsert(rows, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true });
    if (error) throw error;
    EdgeRuntime.waitUntil(
      processQueue(service, {
        tenantId: caller.tenantId,
        budgetMs: 40_000,
        log: (event, detail) => log(reqId, event, detail),
      }).catch((error) => log(reqId, "background_failed", { message: error?.message ?? String(error) })),
    );
  }

  log(reqId, "queued", { tenantId: caller.tenantId, queued: rows.length, skipped: skipped.length });
  return { batchId: requestId, queued: rows.length, skipped };
}

async function cancelBatch(service, caller, body) {
  const batchId = String(body.batchId ?? "");
  if (!UUID_REGEX.test(batchId)) throw new HttpError(400, "invalid_request", "Missing batch id.");
  let query = service
    .from("whatsapp_messages")
    .update({ status: "cancelled", error_key: "cancelled_by_admin", variables: null })
    .eq("tenant_id", caller.tenantId)
    .eq("batch_id", batchId)
    .eq("status", "queued");
  if (caller.branchId) query = query.eq("branch_id", caller.branchId);
  const { error } = await query;
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqId = newRequestId();
  try {
    const service = serviceClient();
    const body = await readJson(req);
    const action = String(body.action ?? "");
    const caller = await requireAdmin(req, service, { tenantWide: false });
    log(reqId, "request", { action, callerId: caller.userId });
    if (action === "queue") return json(await queue(service, caller, body, reqId));
    if (action === "cancel_batch") return json(await cancelBatch(service, caller, body));
    throw new HttpError(400, "unknown_action", "Unknown action.");
  } catch (error) {
    return handle(reqId, error);
  }
});
