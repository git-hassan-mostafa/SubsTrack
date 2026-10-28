// @ts-nocheck — runs on Deno, not Node.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TENANT_CODE_REGEX = /^[a-z0-9]+$/;
const USERNAME_REGEX = /^[a-z0-9._]+$/;

// Used only when app_options.LiraRate is missing or invalid.
const DEFAULT_LIRA_RATE = 89000;

const SIGNUP_CLOSED_MESSAGE =
  "New organizations are opened by Sijil support. Please contact us to get your account.";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time, so response timing never hints at how much of the key matched.
function sameSecret(given: string, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// Only the SaaS owner's service-role key opens an organization — gotcha #33.
function isServiceRoleCaller(req: Request, serviceRoleKey: string): boolean {
  const bearer = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const apiKey = req.headers.get("apikey") ?? "";
  return (
    sameSecret(apiKey, serviceRoleKey) || sameSecret(bearer, serviceRoleKey)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (!isServiceRoleCaller(req, serviceRoleKey)) {
    return jsonResponse(
      { error: SIGNUP_CLOSED_MESSAGE, code: "signup_disabled" },
      403,
    );
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL"),
    serviceRoleKey,
  );

  let createdTenantId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    const body = await req.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const tenantCode =
      typeof body.tenantCode === "string"
        ? body.tenantCode.trim().toLowerCase()
        : "";
    const adminUserName =
      typeof body.adminUserName === "string"
        ? body.adminUserName.trim().toLowerCase()
        : "";
    const adminFullName =
      typeof body.adminFullName === "string" ? body.adminFullName.trim() : "";
    const adminPassword =
      typeof body.adminPassword === "string" ? body.adminPassword : "";

    if (!name)
      return jsonResponse({ error: "Organization name is required" }, 400);
    if (!tenantCode)
      return jsonResponse({ error: "Organization code is required" }, 400);
    if (
      !TENANT_CODE_REGEX.test(tenantCode) ||
      tenantCode.length < 2 ||
      tenantCode.length > 32
    ) {
      return jsonResponse(
        { error: "Organization code must be 2-32 lowercase letters or digits" },
        400,
      );
    }
    if (!adminUserName)
      return jsonResponse({ error: "Username is required" }, 400);
    if (!USERNAME_REGEX.test(adminUserName)) {
      return jsonResponse(
        {
          error:
            "Username can only contain letters, numbers, dots, and underscores",
        },
        400,
      );
    }
    if (!adminFullName)
      return jsonResponse({ error: "Full name is required" }, 400);
    if (adminPassword.length < 8) {
      return jsonResponse(
        { error: "Password must be at least 8 characters" },
        400,
      );
    }

    const { data: liraOption } = await serviceClient
      .from("app_options")
      .select("value")
      .eq("key", "LiraRate")
      .maybeSingle();
    const parsedLiraRate = liraOption ? Number(liraOption.value) : NaN;
    const liraRate =
      Number.isFinite(parsedLiraRate) && parsedLiraRate > 0
        ? parsedLiraRate
        : DEFAULT_LIRA_RATE;

    const { data: tenantRow, error: tenantErr } = await serviceClient
      .from("tenants")
      .insert({ name, tenant_code: tenantCode })
      .select("id, tenant_code")
      .single();

    if (tenantErr) {
      if (tenantErr.code === "23505") {
        const msg = (tenantErr.message ?? "").toLowerCase();
        if (msg.includes("tenant_code")) {
          return jsonResponse(
            {
              error: "Organization code already taken",
              code: "tenant_code_taken",
            },
            409,
          );
        }
        if (msg.includes("name")) {
          return jsonResponse(
            {
              error: "Organization name already taken",
              code: "tenant_name_taken",
            },
            409,
          );
        }
      }
      return jsonResponse({ error: tenantErr.message }, 400);
    }

    createdTenantId = tenantRow.id;

    const { error: branchErr } = await serviceClient
      .from("branches")
      .insert({ tenant_id: createdTenantId, name: "Default Branch" });
    if (branchErr) throw new Error(branchErr.message);

    const email = `${adminUserName}@${tenantCode}.com`;
    const { data: authData, error: authErr } =
      await serviceClient.auth.admin.createUser({
        email,
        password: adminPassword,
        email_confirm: true,
      });
    if (authErr) throw new Error(authErr.message);

    createdAuthUserId = authData.user.id;

    const { error: profileErr } = await serviceClient.from("users").insert({
      id: createdAuthUserId,
      username: adminUserName,
      full_name: adminFullName,
      role: "superadmin",
      tenant_id: createdTenantId,
      branch_id: null,
    });
    if (profileErr) throw new Error(profileErr.message);

    const { error: currencyErr } = await serviceClient
      .from("currencies")
      .insert({
        tenant_id: createdTenantId,
        code: "LBP",
        name: "Lebanese Pound",
        symbol: "ل.ل",
        rate_per_usd: liraRate,
        decimals: 0,
      });
    if (currencyErr) throw new Error(currencyErr.message);

    return jsonResponse({ tenantId: createdTenantId, tenantCode }, 200);
  } catch (err) {
    if (createdAuthUserId) {
      await serviceClient.auth.admin
        .deleteUser(createdAuthUserId)
        .catch(() => {});
    }
    if (createdTenantId) {
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
