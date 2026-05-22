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

Deno.serve(async (req) => {
  console.log("Supabase url", Deno.env.get("SUPABASE_URL"));
  console.log("Service role key", Deno.env.get("SERVICE_ROLE_KEY"));
  console.log("Anon key", Deno.env.get("ANON_KEY"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SERVICE_ROLE_KEY"),
    );

    // Verify caller identity via their JWT
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up caller's profile to get their role, tenant, and branch
    const { data: callerProfile, error: profileLookupErr } = await serviceClient
      .from("users")
      .select("role, tenant_id, branch_id")
      .eq("id", caller.id)
      .single();

    if (profileLookupErr || !callerProfile) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["admin", "superadmin"].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin role required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json();
    const { username, fullName, password, phone, role, tenantId, branchId } = body;

    if (!fullName?.trim()) {
      return new Response(JSON.stringify({ error: "Full name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce tenant isolation: admin can only create users within their own tenant
    if (tenantId !== callerProfile.tenant_id) {
      return new Response(
        JSON.stringify({
          error: "Forbidden: cannot create users for another tenant",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate role — only admin and user are allowed via the app
    if (!["admin", "user"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce branch isolation: branch-scoped admins can only create users in
    // their own branch (no tenant-wide admins, no cross-branch creation).
    // Tenant-wide admins (caller.branch_id IS NULL) can assign any branch
    // (including NULL = unassigned / tenant-wide) within the same tenant.
    let resolvedBranchId: string | null;
    if (callerProfile.branch_id !== null) {
      // Branch-scoped: ignore client-supplied branchId; force their own branch.
      resolvedBranchId = callerProfile.branch_id;
    } else {
      resolvedBranchId = branchId ?? null;
      if (resolvedBranchId !== null) {
        // Verify the branch belongs to the same tenant.
        const { data: branchRow, error: branchErr } = await serviceClient
          .from("branches")
          .select("id, tenant_id")
          .eq("id", resolvedBranchId)
          .single();
        if (branchErr || !branchRow || branchRow.tenant_id !== tenantId) {
          return new Response(
            JSON.stringify({ error: "Invalid branch for this tenant" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    // Server-side mirror of UserService.validate: once the tenant has any
    // branches, role='user' must be assigned to a branch. Branch-scoped
    // callers can never trigger this (resolvedBranchId is forced to their
    // own branch above), so the check only matters for tenant-wide admins.
    if (role === "user" && resolvedBranchId === null) {
      const { count, error: countErr } = await serviceClient
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (countErr) {
        return new Response(
          JSON.stringify({ error: countErr.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if ((count ?? 0) > 0) {
        return new Response(
          JSON.stringify({ error: "Staff users must be assigned to a branch" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Look up tenant_code to build email matching the login convention
    const { data: tenant, error: tenantErr } = await serviceClient
      .from("tenants")
      .select("tenant_code")
      .eq("id", tenantId)
      .single();
    if (tenantErr || !tenant?.tenant_code) {
      return new Response(
        JSON.stringify({ error: "Tenant not found or missing tenant_code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Construct synthetic email matching the login convention: username@tenantcode.com
    const email = `${username}@${tenant.tenant_code}.com`;

    // Create auth user
    const { data: authData, error: authErr } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (authErr) throw new Error(authErr.message);

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
      // Rollback the auth user to keep state consistent
      await serviceClient.auth.admin.deleteUser(userId).catch(() => { });
      throw new Error(profileErr.message);
    }

    return new Response(JSON.stringify(profile), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("error from catech", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
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
