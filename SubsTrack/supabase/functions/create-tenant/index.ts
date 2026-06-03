// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// @ts-nocheck — runs on Deno, not Node.
//
// Public endpoint: callable with the anon key, no session required. Deploy with
//   `supabase functions deploy create-tenant --no-verify-jwt`
//
// Performs the full atomic tenant signup flow with cascading rollback:
//   1. INSERT tenants
//   2. INSERT branches (Default Branch)
//   3. auth.admin.createUser
//   4. INSERT public.users (role='superadmin', branch_id=null)
// Any later failure rolls back earlier steps so the database never carries
// orphaned rows from a half-finished signup.
//
// Future paid-plan hook: `paymentToken` is accepted but unused — when paid
// signup ships, validate the token here before step 1.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TENANT_CODE_REGEX = /^[a-z0-9]+$/;
const USERNAME_REGEX = /^[a-z0-9._]+$/;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SERVICE_ROLE_KEY"),
  );

  let createdTenantId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    const body = await req.json();

    // ---- validate input (re-checked here; do not trust the client) ----
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const tenantCode = typeof body.tenantCode === "string"
      ? body.tenantCode.trim().toLowerCase()
      : "";
    const adminUserName = typeof body.adminUserName === "string"
      ? body.adminUserName.trim().toLowerCase()
      : "";
    const adminFullName = typeof body.adminFullName === "string"
      ? body.adminFullName.trim()
      : "";
    const adminPassword = typeof body.adminPassword === "string"
      ? body.adminPassword
      : "";

    if (!name) return jsonResponse({ error: "Workspace name is required" }, 400);
    if (!tenantCode) return jsonResponse({ error: "Workspace code is required" }, 400);
    if (!TENANT_CODE_REGEX.test(tenantCode) || tenantCode.length < 2 || tenantCode.length > 32) {
      return jsonResponse({ error: "Workspace code must be 2-32 lowercase letters or digits" }, 400);
    }
    if (!adminUserName) return jsonResponse({ error: "Username is required" }, 400);
    if (!USERNAME_REGEX.test(adminUserName)) {
      return jsonResponse({ error: "Username can only contain letters, numbers, dots, and underscores" }, 400);
    }
    if (!adminFullName) return jsonResponse({ error: "Full name is required" }, 400);
    if (adminPassword.length < 8) {
      return jsonResponse({ error: "Password must be at least 8 characters" }, 400);
    }

    // ---- 1. tenants ----
    // Look up the Free tier id. The tenants.tier_id column has a default that
    // resolves to Free, but we set it explicitly so the future paid-plan flow
    // can swap in a different tier without changing the schema.
    const { data: freeTier, error: freeTierErr } = await serviceClient
      .from("tier_plans")
      .select("id")
      .eq("code", "free")
      .single();
    if (freeTierErr || !freeTier) {
      return jsonResponse({ error: "Free tier is not configured" }, 500);
    }

    const { data: tenantRow, error: tenantErr } = await serviceClient
      .from("tenants")
      .insert({ name, tenant_code: tenantCode, tier_id: freeTier.id })
      .select("id, tenant_code")
      .single();

    if (tenantErr) {
      // 23505 = unique_violation. Could be tenant_code or name.
      if (tenantErr.code === "23505") {
        const msg = (tenantErr.message ?? "").toLowerCase();
        if (msg.includes("tenant_code")) {
          return jsonResponse(
            { error: "Workspace code already taken", code: "tenant_code_taken" },
            409,
          );
        }
        if (msg.includes("name")) {
          return jsonResponse(
            { error: "Workspace name already taken", code: "tenant_name_taken" },
            409,
          );
        }
      }
      return jsonResponse({ error: tenantErr.message }, 400);
    }

    createdTenantId = tenantRow.id;

    // ---- 2. branches (Default Branch) ----
    const { error: branchErr } = await serviceClient
      .from("branches")
      .insert({ tenant_id: createdTenantId, name: "Default Branch" });
    if (branchErr) throw new Error(branchErr.message);

    // ---- 3. auth user ----
    const email = `${adminUserName}@${tenantCode}.com`;
    const { data: authData, error: authErr } = await serviceClient.auth.admin
      .createUser({ email, password: adminPassword, email_confirm: true });
    if (authErr) throw new Error(authErr.message);

    createdAuthUserId = authData.user.id;

    // ---- 4. public.users (tenant owner) ----
    const { error: profileErr } = await serviceClient
      .from("users")
      .insert({
        id: createdAuthUserId,
        username: adminUserName,
        full_name: adminFullName,
        role: "superadmin",
        tenant_id: createdTenantId,
        branch_id: null,
      });
    if (profileErr) throw new Error(profileErr.message);

    return jsonResponse(
      { tenantId: createdTenantId, tenantCode },
      200,
    );
  } catch (err) {
    // Cascading rollback — reverse order. Each step swallows its own errors:
    // we already have one failure to report; we don't want a cleanup error
    // to mask it.
    if (createdAuthUserId) {
      await serviceClient.auth.admin
        .deleteUser(createdAuthUserId)
        .catch(() => {});
    }
    if (createdTenantId) {
      // branches FK cascades on tenant delete, so this cleans up the
      // Default Branch too.
      await serviceClient
        .from("tenants")
        .delete()
        .eq("id", createdTenantId)
        .then(() => {})
        .catch(() => {});
    }
    console.log("create-tenant error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      400,
    );
  }
});
