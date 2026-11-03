import { supabase } from "@/src/shared/lib/supabase";

// A failed read never blocks — only a tenant row saying active = false stops sync.
export async function isTenantInactive(): Promise<boolean> {
  const { data } = await supabase
    .from("tenants")
    .select("active")
    .maybeSingle();
  return (data as { active: boolean } | null)?.active === false;
}
