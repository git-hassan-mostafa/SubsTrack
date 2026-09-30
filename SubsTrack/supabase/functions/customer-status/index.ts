// @ts-nocheck — Deno runtime file. Deploy: `cd Web && npm run deploy-customer-status`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  customerStatusPage,
  factsRpcArgs,
  parseCustomerStatusRequest,
} from "./_generated/customerStatus.js";
import { CUSTOMER_WITH_LINES_SELECT } from "./_generated/customerSelect.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function log(reqId: string, event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "customer-status", reqId, event, ...detail }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(reqId: string, status: number, error: string, code: string) {
  log(reqId, "rejected", { status, code, error });
  return json({ error, code }, status);
}

// Every read runs as the CALLER, so RLS scopes it to their tenant and branch.
function callerClient(authHeader: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("ANON_KEY");
  if (!url || !anonKey) throw new Error("SUPABASE_URL or ANON_KEY is not set");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(reqId, 401, "Please sign in again.", "unauthorized");
  const body = await readBody(req);
  if (!body) return fail(reqId, 400, "The request body is not valid JSON.", "invalid_body");
  const parsed = parseCustomerStatusRequest(body, new Date());
  if (!parsed.ok) return fail(reqId, 400, parsed.message, "invalid_request");
  const { request } = parsed;

  try {
    const db = callerClient(authHeader);
    const [facts, settings] = await Promise.all([
      db.rpc("customer_status_facts", factsRpcArgs(request.branch)),
      db.from("tenant_settings").select("key, value"),
    ]);
    if (facts.error) throw facts.error;
    if (settings.error) throw settings.error;
    const readMs = Date.now() - started;

    const page = customerStatusPage(facts.data, settings.data ?? [], request);
    const computeMs = Date.now() - started - readMs;

    const ids = page.rows.map((row) => row.customerId);
    const customers = ids.length
      ? await db.from("customers").select(CUSTOMER_WITH_LINES_SELECT).in("id", ids)
      : { data: [], error: null };
    if (customers.error) throw customers.error;
    const byId = new Map(customers.data.map((c) => [c.id, c]));
    const rows = page.rows
      .filter((row) => byId.has(row.customerId))
      .map((row) => ({
        customer: byId.get(row.customerId),
        status: row.status,
        debtUsd: row.debtUsd,
      }));

    log(reqId, "served", {
      tab: request.tab,
      total: page.total,
      rows: rows.length,
      customers: facts.data.customers.length,
      lines: facts.data.lines.length,
      readMs,
      computeMs,
      totalMs: Date.now() - started,
    });
    return json({ rows, total: page.total, counts: page.counts });
  } catch (error) {
    log(reqId, "error", {
      message: error instanceof Error ? error.message : String(error?.message ?? error),
    });
    return json(
      { error: "Could not load the customers. Please try again.", code: "server_error" },
      500,
    );
  }
});
