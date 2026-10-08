import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCharge } from "@shared/core/types/db";
import type { CreateChargePayload } from "./IChargeRepository";
import { monthBillKey } from "./chargeRevive";

export interface BillOwners {
  byKey: Map<string, DbCharge>;
  byId: Map<string, DbCharge>;
}

// Both sides `resolveBillTarget` weighs: who holds the month, who holds the id.
export async function findBillOwners(
  db: SupabaseClient,
  charges: CreateChargePayload[],
  fail: (error: unknown) => never,
): Promise<BillOwners> {
  const { data: idRows, error: idError } = await db
    .from("charges")
    .select("*")
    .in(
      "id",
      charges.map((c) => c.id),
    );
  if (idError) fail(idError);
  const byId = new Map(((idRows ?? []) as DbCharge[]).map((r) => [r.id, r]));

  const byKey = new Map<string, DbCharge>();
  const keyed = charges.filter((c) => monthBillKey(c) !== null);
  if (keyed.length === 0) return { byKey, byId };

  const { data: keyRows, error: keyError } = await db
    .from("charges")
    .select("*")
    .in("customer_plan_id", [
      ...new Set(keyed.map((c) => c.customer_plan_id as string)),
    ])
    .in("billing_month", [
      ...new Set(keyed.map((c) => c.billing_month as string)),
    ]);
  if (keyError) fail(keyError);
  for (const row of (keyRows ?? []) as DbCharge[])
    byKey.set(monthBillKey(row) as string, row);
  return { byKey, byId };
}
