// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
// @ts-nocheck — this file runs on Deno, not Node.js. Type checking is done by the Deno toolchain.
// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// One structured JSON line per event, greppable in the dashboard's logs.
function log(reqId: string, event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ fn: "create-user", reqId, event, ...detail }));
}

// Every rejection logs its reason AND returns it, so a 4xx is always
// explainable from the logs alone.
function fail(
  reqId: string,
  status: number,
  error: string,
  detail: Record<string, unknown> = {},
) {
  log(reqId, "rejected", { status, error, ...detail });
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Short id tying every line of one call together across concurrent requests.
  const reqId = crypto.randomUUID().slice(0, 8);
  // x-client-info is how a phone build is told apart from the web one.
  log(reqId, "request", {
    method: req.method,
    client: req.headers.get("x-client-info") ?? null,
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail(reqId, 401, "Unauthorized", { reason: "no_auth_header" });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SERVICE_ROLE_KEY"),
    );

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    // Parse body and verify JWT in parallel — body parsing has no security
    // implications since we validate the caller before acting on the body.
    const [body, { data: { user: caller }, error: callerErr }] = await Promise.all([
      req.json(),
      callerClient.auth.getUser(),
    ]);

    if (callerErr || !caller) {
      // Decode the unverified payload only to report WHY — an expired token is a
      // stale client, a malformed one is a wiring bug, and they need different fixes.
      let tokenExpiredAt: string | null = null;
      let tokenIsAnon = false;
      try {
        const raw = authHeader.replace(/^Bearer\s+/i, "");
        const claims = JSON.parse(atob(raw.split(".")[1]));
        tokenExpiredAt = claims.exp ? new Date(claims.exp * 1000).toISOString() : null;
        tokenIsAnon = claims.role === "anon";
      } catch {
        // Not a JWT at all — the two flags stay at their defaults.
      }
      return fail(reqId, 401, "Unauthorized", {
        reason: "jwt_rejected",
        authError: callerErr?.message ?? null,
        tokenExpiredAt,
        tokenExpired: tokenExpiredAt !== null && tokenExpiredAt < new Date().toISOString(),
        tokenIsAnon,
      });
    }

    log(reqId, "caller_authenticated", { callerId: caller.id });

    // Look up caller's profile to get their role, tenant, and branch
    const { data: callerProfile, error: profileLookupErr } = await serviceClient
      .from("users")
      .select("role, tenant_id, branch_id")
      .eq("id", caller.id)
      .single();

    if (profileLookupErr || !callerProfile) {
      return fail(reqId, 401, "Unauthorized", {
        reason: "caller_profile_missing",
        callerId: caller.id,
        dbError: profileLookupErr?.message ?? null,
      });
    }

    if (!["admin", "superadmin"].includes(callerProfile.role)) {
      return fail(reqId, 403, "Forbidden: admin role required", {
        callerRole: callerProfile.role,
      });
    }

    const { username, fullName, password, phone, role, tenantId, branchId } = body;

    // The payload as received — never the password itself.
    log(reqId, "payload", {
      username: username ?? null,
      hasFullName: !!fullName?.trim(),
      passwordLength: typeof password === "string" ? password.length : 0,
      role: role ?? null,
      tenantId: tenantId ?? null,
      branchId: branchId ?? null,
      callerRole: callerProfile.role,
      callerTenantId: callerProfile.tenant_id,
      callerBranchId: callerProfile.branch_id,
    });

    if (!fullName?.trim()) {
      return fail(reqId, 400, "Full name is required");
    }

    // Enforce tenant isolation: admin can only create users within their own tenant
    if (tenantId !== callerProfile.tenant_id) {
      return fail(
        reqId,
        403,
        "Forbidden: cannot create users for another tenant",
        { tenantId, callerTenantId: callerProfile.tenant_id },
      );
    }

    // Validate role — only admin and user are allowed via the app
    if (!["admin", "user"].includes(role)) {
      return fail(reqId, 400, "Invalid role", { role });
    }

    // Enforce branch isolation: branch-scoped admins can only create users in
    // their own branch. Tenant-wide admins (branch_id IS NULL) can assign any
    // branch (including NULL = tenant-wide) within the same tenant.
    const resolvedBranchId: string | null = callerProfile.branch_id !== null
      ? callerProfile.branch_id   // branch-scoped: force their own branch
      : (branchId ?? null);

    // Fan out all independent lookups in parallel:
    //   - tenant_code is always needed
    //   - branch ownership check: only for tenant-wide admins supplying an explicit branchId
    //   - branch existence count: only for role='user' with no assigned branch
    const needsBranchValidation = callerProfile.branch_id === null && resolvedBranchId !== null;
    const needsBranchCount = role === "user" && resolvedBranchId === null;

    log(reqId, "branch_resolved", {
      resolvedBranchId,
      needsBranchValidation,
      needsBranchCount,
    });

    const [
      { data: tenant, error: tenantErr },
      { data: branchRow, error: branchErr },
      { count, error: countErr },
    ] = await Promise.all([
      serviceClient.from("tenants").select("tenant_code").eq("id", tenantId).single(),
      needsBranchValidation
        ? serviceClient.from("branches").select("id, tenant_id").eq("id", resolvedBranchId).single()
        : Promise.resolve({ data: null, error: null }),
      needsBranchCount
        ? serviceClient.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
        : Promise.resolve({ count: 0, error: null }),
    ]);

    if (tenantErr || !tenant?.tenant_code) {
      return fail(reqId, 400, "Tenant not found or missing tenant_code", {
        tenantId,
        dbError: tenantErr?.message ?? null,
      });
    }

    if (needsBranchValidation && (branchErr || !branchRow || branchRow.tenant_id !== tenantId)) {
      return fail(reqId, 400, "Invalid branch for this tenant", {
        resolvedBranchId,
        tenantId,
        branchTenantId: branchRow?.tenant_id ?? null,
        dbError: branchErr?.message ?? null,
      });
    }

    if (needsBranchCount) {
      if (countErr) {
        return fail(reqId, 500, countErr.message, { step: "branch_count" });
      }
      if ((count ?? 0) > 0) {
        // The usual phone-only failure: the client sent no branch because its
        // local mirror had none, while the tenant really does have branches.
        return fail(reqId, 400, "Staff users must be assigned to a branch", {
          tenantBranchCount: count,
        });
      }
    }

    // Construct synthetic email matching the login convention: username@tenantcode.com
    const email = `${username}@${tenant.tenant_code}.com`;

    log(reqId, "creating_auth_user", { email });

    // Create auth user
    const { data: authData, error: authErr } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (authErr) {
      log(reqId, "auth_create_failed", { email, authError: authErr.message });
      throw new Error(authErr.message);
    }

    const userId = authData.user.id;

    // Insert public.users row
    const { data: profile, error: profileErr } = await serviceClient
      .from("users")
      .insert({
        id: userId,
        username,
        full_name: fullName.trim(),
        phone_number: phone ?? null,
        role,
        tenant_id: tenantId,
        branch_id: resolvedBranchId,
      })
      .select()
      .single();

    if (profileErr) {
      log(reqId, "profile_insert_failed", {
        userId,
        dbError: profileErr.message,
        dbCode: profileErr.code ?? null,
        dbDetails: profileErr.details ?? null,
      });
      // Rollback the auth user to keep state consistent
      await serviceClient.auth.admin.deleteUser(userId).catch(() => { });
      throw new Error(profileErr.message);
    }

    log(reqId, "created", { userId, role, branchId: resolvedBranchId });

    return new Response(JSON.stringify(profile), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log(reqId, "unhandled", {
      message,
      stack: err instanceof Error ? err.stack : null,
    });
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-user' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
