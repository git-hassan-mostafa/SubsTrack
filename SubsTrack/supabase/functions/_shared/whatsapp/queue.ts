// @ts-nocheck — Deno runtime file.
import { accountToken, markAttention } from "./accounts.ts";
import { graphRequest, MetaError } from "./graph.ts";
import {
  attentionCodeFor,
  backoffMs,
  buildTemplateMessage,
  classifyMetaError,
  errorKeyFor,
  shouldRetry,
  tierLimit,
} from "./rules.ts";

const CLAIM_BATCH = 25;
const IN_FLIGHT = 10;
const DAILY_LIMIT_DEFER_MS = 60 * 60_000;

interface AccountContext {
  account: { id: string; phone_number_id: string; status: string; messaging_limit_tier: string | null };
  token: string | null;
  limit: number;
  reached: number;
  reachedPhones: Set<string>;
  blocked: boolean;
}

async function loadContext(service, accountId: string): Promise<AccountContext> {
  const { data: account } = await service
    .from("whatsapp_accounts")
    .select("id, phone_number_id, status, messaging_limit_tier")
    .eq("id", accountId)
    .maybeSingle();
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [token, reachedResult, phonesResult] = await Promise.all([
    account ? accountToken(service, accountId) : Promise.resolve(null),
    service.rpc("whatsapp_reached_last_day", { p_account_id: accountId }),
    service
      .from("whatsapp_messages")
      .select("to_phone_e164")
      .eq("account_id", accountId)
      .gt("accepted_at", since),
  ]);
  if (account?.status === "connected" && !token) {
    await markAttention(service, accountId, "token_invalid");
  }
  return {
    account,
    token,
    limit: tierLimit(account?.messaging_limit_tier),
    reached: reachedResult.data ?? 0,
    reachedPhones: new Set((phonesResult.data ?? []).map((r) => r.to_phone_e164)),
    blocked: !account || account.status !== "connected" || !token,
  };
}

async function release(service, row, patch: Record<string, unknown>) {
  await service
    .from("whatsapp_messages")
    .update({ status: "queued", locked_at: null, attempts: Math.max(0, row.attempts - 1), ...patch })
    .eq("id", row.id)
    .eq("status", "sending");
}

async function markAccepted(service, row, wamid: string | null) {
  const now = new Date().toISOString();
  await service
    .from("whatsapp_messages")
    .update({ wamid, accepted_at: now, locked_at: null, variables: null, error_key: null })
    .eq("id", row.id);
  await service
    .from("whatsapp_messages")
    .update({ status: "accepted" })
    .eq("id", row.id)
    .in("status", ["sending", "unknown"]);
}

async function markFailure(service, row, error: MetaError) {
  const now = new Date().toISOString();
  const errorKey = errorKeyFor(error.code, error.httpStatus);
  const base = {
    locked_at: null,
    error_code: error.code,
    error_title: (error.title ?? error.message ?? "").slice(0, 300),
    error_key: errorKey,
  };

  if (error.networkFailure) {
    await service
      .from("whatsapp_messages")
      .update({ ...base, status: "unknown", error_key: "unknown_outcome", variables: null })
      .eq("id", row.id)
      .eq("status", "sending");
    return "unknown";
  }

  const kind = classifyMetaError(error.code, error.httpStatus);
  if (kind === "retry" && shouldRetry(row.attempts)) {
    await service
      .from("whatsapp_messages")
      .update({
        ...base,
        status: "queued",
        next_attempt_at: new Date(Date.now() + backoffMs(row.attempts)).toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "sending");
    return "retry";
  }

  await service
    .from("whatsapp_messages")
    .update({ ...base, status: "failed", failed_at: now, variables: null })
    .eq("id", row.id)
    .eq("status", "sending");
  return kind === "account" ? "account" : "failed";
}

async function sendOne(service, context: AccountContext, row) {
  if (context.blocked) {
    await release(service, row, {});
    return;
  }
  const isNewRecipient = !context.reachedPhones.has(row.to_phone_e164);
  if (isNewRecipient && context.reached >= context.limit) {
    await release(service, row, {
      next_attempt_at: new Date(Date.now() + DAILY_LIMIT_DEFER_MS).toISOString(),
      error_key: "daily_limit",
    });
    return;
  }
  if (isNewRecipient) {
    context.reached++;
    context.reachedPhones.add(row.to_phone_e164);
  }

  try {
    const response = await graphRequest(
      "POST",
      `${context.account.phone_number_id}/messages`,
      context.token,
      {
        body: buildTemplateMessage({
          to: row.to_phone_e164,
          templateName: row.template_name,
          language: row.language,
          variables: row.variables ?? { format: "named", values: [] },
          callbackId: row.id,
        }),
      },
    );
    await markAccepted(service, row, response?.messages?.[0]?.id ?? null);
  } catch (error) {
    const metaError =
      error instanceof MetaError ? error : new MetaError(String(error), null, 0, null, true);
    const outcome = await markFailure(service, row, metaError);
    if (outcome === "account") {
      context.blocked = true;
      await markAttention(service, context.account.id, attentionCodeFor(metaError.code) ?? "meta_error");
    }
  }
}

async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

// Sends due rows until the queue is empty or the time budget runs out.
export async function processQueue(
  service,
  options: { tenantId?: string | null; budgetMs?: number; log?: (event: string, detail?: Record<string, unknown>) => void } = {},
) {
  const started = Date.now();
  const budget = options.budgetMs ?? 50_000;
  const contexts = new Map<string, AccountContext>();
  let processed = 0;

  while (Date.now() - started < budget) {
    const { data: rows, error } = await service.rpc("whatsapp_claim_messages", {
      p_limit: CLAIM_BATCH,
      p_tenant_id: options.tenantId ?? null,
    });
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const byAccount = new Map<string, unknown[]>();
    for (const row of rows) {
      byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row]);
    }
    for (const [accountId, accountRows] of byAccount) {
      if (!contexts.has(accountId)) contexts.set(accountId, await loadContext(service, accountId));
      const context = contexts.get(accountId);
      await runLimited(accountRows, IN_FLIGHT, (row) => sendOne(service, context, row));
    }
    processed += rows.length;
    if (rows.length < CLAIM_BATCH) break;
  }

  options.log?.("queue_processed", { processed, ms: Date.now() - started });
  return processed;
}
