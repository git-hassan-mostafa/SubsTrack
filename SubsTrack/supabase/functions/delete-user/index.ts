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

    const body = await req.json();
    const { userId: targetId } = body;

    if (!targetId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetId === caller.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: targetProfile, error: targetErr } = await serviceClient
      .from("users")
      .select("role, tenant_id")
      .eq("id", targetId)
      .single();

    if (targetErr || !targetProfile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetProfile.tenant_id !== callerProfile.tenant_id) {
      return new Response(
        JSON.stringify({
          error: "Forbidden: cannot delete users from another tenant",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (callerProfile.role === "admin" && targetProfile.role !== "user") {
      return new Response(
        JSON.stringify({
          error: "Forbidden: admin can only delete staff users",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Delete public.users first so FK references are cleaned up before the
    // auth row is removed (auth delete cascades in some setups but we be explicit).
    const { error: publicDeleteErr } = await serviceClient
      .from("users")
      .delete()
      .eq("id", targetId);
    if (publicDeleteErr) throw new Error(publicDeleteErr.message);

    const { error: authDeleteErr } =
      await serviceClient.auth.admin.deleteUser(targetId);
    if (authDeleteErr) throw new Error(authDeleteErr.message);

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
