// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// @ts-nocheck — this file runs on Deno, not Node.js.
//
// Public endpoint: callable with no session at all. Deploy with
//   `supabase functions deploy customer-portal --no-verify-jwt`
//
// THE ONLY TENANT/CUSTOMER BOUNDARY FOR THE PORTAL.
// Nothing in the database narrows a read to one customer: every RLS policy is
// `tenant_id = current_tenant_id()` off a STAFF jwt, and current_branch_id()
// returns NULL for anyone absent from public.users — which every policy then
// reads as "tenant-wide admin". So a portal visitor must never hold a Postgres
// role at all; this function holds the service role and scopes the read in code.
//
// That makes one rule absolute: every query below filters on the customerId and
// tenantId taken from the VERIFIED token, never on anything in the request body.
//
// Two actions:
//   { action: "login", customerId, password } -> { token }
//   { action: "data",  token }                -> the whole read model
//
// The read model is raw snake_case Db* rows. The portal's repository layer maps
// them with SubsTrack's own mappers, so no mapping is duplicated here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOKEN_TTL = "30d";
const MAX_FAILED = 10;
const LOCK_MINUTES = 15;
const WINDOW_MINUTES = 15;

// One structured JSON line per event, greppable in the dashboard's logs.
function log(
  reqId: string,
  event: string,
  detail: Record<string, unknown> = {},
) {
  console.log(
    JSON.stringify({ fn: "customer-portal", reqId, event, ...detail }),
  );
}

// Every rejection logs its reason AND returns it, so a 4xx is always
// explainable from the logs alone.
function fail(
  reqId: string,
  status: number,
  error: string,
  code: string,
  detail: Record<string, unknown> = {},
) {
  log(reqId, "rejected", { status, error, code, ...detail });
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secret() {
  const value = Deno.env.get("PORTAL_JWT_SECRET");
  if (!value) throw new Error("PORTAL_JWT_SECRET is not set");
  return new TextEncoder().encode(value);
}

// Resolves the caller to ONE customer. Every read downstream uses this result
// and nothing else — that is the whole security model.
async function verifyToken(token: string) {
  const { payload } = await jose.jwtVerify(token, secret());
  if (!payload.sub || !payload.tid) throw new Error("malformed token");
  return { customerId: String(payload.sub), tenantId: String(payload.tid) };
}

// Nulls the columns a customer must never read. Nulling rather than omitting
// keeps the row a valid Db* shape, so SubsTrack's existing mappers still
// compile against it on the portal side.
function redact(row, fields: string[]) {
  if (!row) return row;
  for (const field of fields) row[field] = null;
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Short id tying every line of one call together across concurrent requests.
  const reqId = crypto.randomUUID().slice(0, 8);
  log(reqId, "request", {
    method: req.method,
    client: req.headers.get("x-client-info") ?? null,
  });

  // A missing secret otherwise surfaces as a generic 500 on the FIRST correct
  // password, which reads like a money bug rather than an unset env var.
  const missing = ["SUPABASE_URL", "SERVICE_ROLE_KEY", "PORTAL_JWT_SECRET"]
    .filter((name) => !Deno.env.get(name));
  if (missing.length > 0) {
    return fail(reqId, 500, "The portal is not configured", "not_configured", {
      missing,
    });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SERVICE_ROLE_KEY"),
  );

  try {
    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "login") return await login(reqId, serviceClient, body);
    if (action === "data") return await data(reqId, serviceClient, body);
    return fail(reqId, 400, "Unknown action", "bad_request");
  } catch (err) {
    log(reqId, "error", { message: String(err?.message ?? err) });
    return fail(reqId, 500, "Something went wrong", "server_error");
  }
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

// A wrong password, an unknown customer, a portal switched off and an inactive
// tenant ALL answer with this one response. The link is a bare customer id, so
// any difference between them would confirm that a given customer exists.
function badCredentials(reqId: string, reason: string) {
  return fail(reqId, 401, "Wrong password", "bad_credentials", { reason });
}

async function login(reqId: string, db, body: Record<string, unknown>) {
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  const password = typeof body.password === "string" ? body.password : "";

  // Refused before it reaches Postgres: a non-uuid errors the query, and that
  // error would itself tell the caller the id shape was wrong.
  if (!UUID_REGEX.test(customerId)) return badCredentials(reqId, "bad_id");
  if (!password) return badCredentials(reqId, "no_password");

  const { data: lock } = await db
    .from("customer_portal_lockouts")
    .select("customer_id, failed_count, first_failed_at, locked_until")
    .eq("customer_id", customerId)
    .maybeSingle();

  const now = new Date();
  if (lock?.locked_until && new Date(lock.locked_until) > now) {
    return fail(reqId, 423, "Too many tries. Try again later.", "locked", {
      customerId,
    });
  }

  const { data: customer } = await db
    .from("customers")
    .select("id, tenant_id, portal_password, portal_enabled, tenants(active)")
    .eq("id", customerId)
    .maybeSingle();

  const granted =
    !!customer &&
    customer.portal_enabled === true &&
    customer.tenants?.active === true &&
    typeof customer.portal_password === "string" &&
    customer.portal_password === password;

  if (!granted) {
    await recordFailure(db, customerId, lock, now);
    log(reqId, "login_failed", {
      customerId,
      passwordLength: password.length,
      found: !!customer,
    });
    return badCredentials(reqId, "denied");
  }

  await db
    .from("customer_portal_lockouts")
    .delete()
    .eq("customer_id", customerId);

  const token = await new jose.SignJWT({ tid: customer.tenant_id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customer.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret());

  log(reqId, "login_ok", { customerId });
  return ok({ token });
}

// The counter is the durable half of the throttle and the only one that works:
// edge functions scale out, so an in-process delay would not hold. The window
// restarts once WINDOW_MINUTES pass with no further failure.
async function recordFailure(db, customerId: string, lock, now: Date) {
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const inWindow =
    lock?.first_failed_at && new Date(lock.first_failed_at) > windowStart;
  const failedCount = inWindow ? (lock.failed_count ?? 0) + 1 : 1;
  const lockedUntil =
    failedCount >= MAX_FAILED
      ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString()
      : null;

  // No customer row may exist for this id, and the FK then rejects the upsert.
  // That is correct: there is nothing to throttle.
  await db.from("customer_portal_lockouts").upsert(
    {
      customer_id: customerId,
      failed_count: failedCount,
      first_failed_at: inWindow ? lock.first_failed_at : now.toISOString(),
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    },
    { onConflict: "customer_id" },
  );
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------

// Explicit, because `*` would ship notes, void reasons and the recorder's id.
const CHARGE_COLUMNS =
  "id, tenant_id, branch_id, customer_id, kind, customer_plan_id, billing_month, duration_months, plan_id, sale_id, description, amount, currency_id, rate_per_usd_snapshot, issued_at, due_date, created_at, updated_at, written_off_at";

const COLLECTION_COLUMNS =
  "id, tenant_id, branch_id, customer_id, amount, currency_id, rate_per_usd_snapshot, received_at, received_by_user_id, kind, created_at, updated_at, collection_items(id, tenant_id, collection_id, charge_id, amount, created_at, updated_at)";

const SALE_COLUMNS =
  "id, tenant_id, branch_id, items_summary, customer_id, total_amount, currency_id, rate_per_usd_snapshot, sold_at, created_at, updated_at, sale_items(id, sale_id, tenant_id, line_type, product_id, service_id, item_name_snapshot, quantity, unit_amount, voided_at, created_at, updated_at)";

async function data(reqId: string, db, body: Record<string, unknown>) {
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return fail(reqId, 401, "Not signed in", "no_token");

  let session;
  try {
    session = await verifyToken(token);
  } catch {
    return fail(reqId, 401, "Please sign in again", "bad_token");
  }
  const { customerId, tenantId } = session;

  const { data: customer } = await db
    .from("customers")
    .select(
      "id, name, phone_number, address, area, notes, location_url, active, is_regular, tenant_id, branch_id, cancelled_at, created_at, updated_at, branches(name), tenants(name, active)",
    )
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!customer || customer.tenants?.active !== true) {
    return fail(reqId, 403, "This page is not available", "unavailable");
  }

  const [lines, charges, collections, skips, currencies, settings] =
    await Promise.all([
      db
        .from("customer_plans")
        .select("*, plans(*)")
        .eq("customer_id", customerId)
        .eq("tenant_id", tenantId),
      // NOT year-scoped on purpose: the portal's year arrows re-derive the grid
      // in memory rather than re-querying (gotcha #121).
      db
        .from("charges")
        .select(CHARGE_COLUMNS)
        .eq("customer_id", customerId)
        .eq("tenant_id", tenantId)
        .is("voided_at", null),
      db
        .from("collections")
        .select(COLLECTION_COLUMNS)
        .eq("customer_id", customerId)
        .eq("tenant_id", tenantId)
        .is("voided_at", null)
        .order("received_at", { ascending: false }),
      db
        .from("skipped_months")
        .select("*")
        .eq("customer_id", customerId)
        .eq("tenant_id", tenantId),
      db.from("currencies").select("*").eq("tenant_id", tenantId),
      db
        .from("tenant_settings")
        .select("key, value")
        .eq("tenant_id", tenantId)
        .in("key", ["UnpaidStartRule", "DisplayCurrencyId"]),
    ]);

  const chargeRows = charges.data ?? [];
  const chargeIds = chargeRows.map((row) => row.id);
  const saleIds = chargeRows.map((row) => row.sale_id).filter(Boolean);
  const collectionRows = collections.data ?? [];

  // `paid` is never a column — it is SUM(collection_items), exposed by the
  // charge_balances view, which is also what excludes voided hand-overs.
  const [balances, sales, collectors] = await Promise.all([
    chargeIds.length
      ? db.from("charge_balances").select("id, paid").in("id", chargeIds)
      : Promise.resolve({ data: [] }),
    saleIds.length
      ? db
          .from("sales")
          .select(SALE_COLUMNS)
          .in("id", saleIds)
          .eq("tenant_id", tenantId)
          .is("voided_at", null)
      : Promise.resolve({ data: [] }),
    collectorNames(db, tenantId, collectionRows),
  ]);

  const paidByCharge: Record<string, number> = {};
  for (const row of balances.data ?? []) paidByCharge[row.id] = row.paid;

  log(reqId, "data_ok", {
    customerId,
    charges: chargeRows.length,
    collections: collectionRows.length,
  });

  const { branches, tenants, ...customerOwnColumns } = customer;

  return ok({
    org: { name: tenants?.name ?? "" },
    branch: branches ? { name: branches.name } : null,
    // portal_password is not in the select above; it is nulled again here so a
    // later edit to that column list cannot hand a customer their own password
    // back over the wire.
    customer: redact(customerOwnColumns, [
      "notes",
      "location_url",
      "portal_password",
    ]),
    lines: lines.data ?? [],
    charges: chargeRows,
    paidByCharge,
    collections: collectionRows,
    sales: sales.data ?? [],
    skips: skips.data ?? [],
    currencies: currencies.data ?? [],
    collectors,
    settings: Object.fromEntries(
      (settings.data ?? []).map((row) => [row.key, row.value]),
    ),
  });
}

// Only the names this customer's own hand-overs point at. The custody chain
// (held_by / remitted_by) is staff-internal and is never selected at all.
async function collectorNames(db, tenantId: string, collections) {
  const ids = [
    ...new Set(
      collections.map((row) => row.received_by_user_id).filter(Boolean),
    ),
  ];
  if (!ids.length) return [];
  const { data } = await db
    .from("users")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  return data ?? [];
}
