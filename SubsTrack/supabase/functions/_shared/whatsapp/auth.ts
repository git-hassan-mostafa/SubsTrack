// @ts-nocheck — Deno runtime file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError, requireEnv } from "./http.ts";

export interface Caller {
  userId: string;
  tenantId: string;
  branchId: string | null;
  role: "admin" | "superadmin";
  tenantWide: boolean;
}

export function serviceClient() {
  const env = requireEnv(["SUPABASE_URL", "SERVICE_ROLE_KEY"]);
  return createClient(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// The tenant is the one on the caller's users row, never anything in the body.
export async function requireAdmin(
  req: Request,
  service,
  options: { tenantWide: boolean },
): Promise<Caller> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "unauthorized", "Please sign in again.");

  const env = requireEnv(["SUPABASE_URL", "ANON_KEY"]);
  const callerClient = createClient(env.SUPABASE_URL, env.ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) {
    throw new HttpError(401, "unauthorized", "Please sign in again.", {
      authError: error?.message ?? null,
    });
  }

  const { data: profile } = await service
    .from("users")
    .select("role, tenant_id, branch_id, active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !profile.active) {
    throw new HttpError(403, "forbidden", "Your account cannot do this.");
  }
  if (profile.role !== "admin" && profile.role !== "superadmin") {
    throw new HttpError(403, "forbidden", "Only admins can use WhatsApp messaging.");
  }

  const tenantWide = profile.role === "superadmin" || profile.branch_id === null;
  if (options.tenantWide && !tenantWide) {
    throw new HttpError(403, "forbidden", "Only organization-wide admins can change WhatsApp settings.");
  }

  await requireWhatsAppTenant(service, profile.tenant_id);

  return {
    userId: data.user.id,
    tenantId: profile.tenant_id,
    branchId: tenantWide ? null : profile.branch_id,
    role: profile.role,
    tenantWide,
  };
}

export async function requireWhatsAppTenant(service, tenantId: string) {
  const { data: tenant } = await service
    .from("tenants")
    .select("active, whatsapp_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant || !tenant.active) {
    throw new HttpError(403, "tenant_inactive", "This organization is not active.");
  }
  if (!tenant.whatsapp_enabled) {
    throw new HttpError(403, "whatsapp_not_enabled", "WhatsApp messaging is not turned on for your organization.");
  }
}

export async function readAppOptions(service, keys: string[]): Promise<Record<string, string>> {
  const { data } = await service.from("app_options").select("key, value").in("key", keys);
  const values: Record<string, string> = {};
  for (const row of data ?? []) values[row.key] = (row.value ?? "").trim();
  return values;
}
