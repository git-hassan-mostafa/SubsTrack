// @ts-nocheck — this file runs on Deno, not Node.js. Type checking is done by the Deno toolchain.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const [body, { data: { user: caller }, error: callerErr }] = await Promise.all([
      req.json(),
      callerClient.auth.getUser(),
    ]);

    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: profileLookupErr } = await serviceClient
      .from("users")
      .select("role, tenant_id")
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

    const { userId, newPassword } = body;

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: "userId and newPassword are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the target user belongs to the same tenant as the caller
    const { data: targetProfile, error: targetErr } = await serviceClient
      .from("users")
      .select("tenant_id, role")
      .eq("id", userId)
      .single();

    if (targetErr || !targetProfile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetProfile.tenant_id !== callerProfile.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot modify users from another tenant" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Admins can only change passwords of staff users, not other admins/superadmins
    if (callerProfile.role === "admin" && targetProfile.role !== "user") {
      return new Response(
        JSON.stringify({ error: "Forbidden: admins can only change passwords of staff users" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: updateErr } = await serviceClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
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
